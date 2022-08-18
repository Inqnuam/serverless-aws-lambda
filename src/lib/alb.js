import http from "http";
import { networkInterfaces } from "os";
import { AlbRouter } from "./router.js";
import { LambdaMock } from "./lambda.js";
import inspector from "inspector";
import * as log from "./colorize.js";

const localIp = Object.values(networkInterfaces())
  .flat()
  .filter((item) => !item.internal && item.family === "IPv4")
  .find(Boolean).address;

const debuggerIsAttached = inspector.url() != undefined;

if (debuggerIsAttached) {
  console.warn("Lambdas timeout are disabled when a Debugger is attached");
}
export class ApplicationLoadBalancer extends AlbRouter {
  #server = null;
  runtimeConfig = {};
  constructor(config = { debug: false }) {
    super(config);
    this.#server = http.createServer(this.#requestListener.bind(this));
  }
  get port() {
    return this.PORT;
  }
  get #get502HtmlContent() {
    const htmlContent502 = `<html>

<head>
	<title>502 Bad Gateway</title>
</head>

<body>
	<center>
		<h1>502 Bad Gateway</h1>
	</center>
</body>

</html>`;

    return htmlContent502;
  }
  listen(port = 0, callback) {
    if (typeof Number(port) !== "number") {
      throw Error("port should be a number");
    }
    this.#server.listen(port, () => {
      const { port: listeningPort } = this.#server.address();
      this.PORT = listeningPort;
      if (typeof callback == "function") {
        callback(listeningPort);
      } else {
        const output = `✅ Application Load Balancer is listening on http://localhost:${listeningPort} | http://${localIp}:${listeningPort}`;

        log.GREEN(output);
      }
    });
  }

  #requestListener(req, res) {
    const { url, method, headers } = req;

    const parsedURL = new URL(url, "http://localhost:3003");
    let body = Buffer.alloc(0);

    const contentType = headers["content-type"];
    let event = this.#convertReqToAlbEvent(req);

    if (this.debug) {
      log.YELLOW("event:");
      console.log(event);
    }
    const lambdaController = this.getHandler(method, parsedURL.pathname);

    if (lambdaController) {
      req
        .on("data", (chunk) => {
          body += chunk;
        })
        .on("end", async () => {
          if (contentType && (contentType.includes("json") || contentType.includes("xml") || contentType.startsWith("text/"))) {
            event.body = body.toString();
          }

          this.#responseHandler(res, event, lambdaController);
        })
        .on("error", (err) => {
          console.error(err.stack);
        });
    } else {
      res.statusCode = 404;
      res.end(this.#get502HtmlContent);
    }
  }

  async #responseHandler(res, event, lambdaController) {
    const hrTimeStart = process.hrtime();

    res.on("finish", () => {
      const endAt = process.hrtime(hrTimeStart);
      const execTime = `${endAt[0]},${endAt[1]}s`;

      log.YELLOW(`⌛️ Lambda execution time: ${execTime}`);
    });

    res.on("error", (err) => {
      console.error(err);
    });

    try {
      const responseData = await this.#getLambdaResponse(event, lambdaController, res);
      if (!res.writableFinished) {
        this.#setResponseHead(res, responseData);
        this.#writeResponseBody(res, responseData);
      }
    } catch (error) {
      if (!res.writableFinished) {
        res.statusCode = 500;
        res.end(this.#get502HtmlContent);
      }

      console.error(error);
    }
  }

  #setResponseHead(res, responseData) {
    res.setHeader("Server", "awselb/2.0");
    res.setHeader("Date", new Date().toUTCString());

    res.statusCode = responseData.statusCode ?? 200;
    res.statusMessage = responseData.statusMessage ?? "";

    if (typeof responseData.headers == "object" && !Array.isArray(responseData.headers)) {
      const headersKeys = Object.keys(responseData.headers).filter((key) => key !== "Server" && key !== "Date");
      headersKeys.forEach((key) => {
        res.setHeader(key, responseData.headers[key]);
      });
    }

    if (!responseData.statusCode) {
      console.warn("Invalid 'statudCode'. default 200 is sent to client");
    }
  }

  #writeResponseBody(res, responseData) {
    if (typeof responseData.body != "string" && res.statusCode && String(res.statusCode).startsWith("2")) {
      console.warn("response 'body' must be a string. Receievd", typeof responseData.body);
      responseData.body = "";

      // TODO: if statudCode 404 send html 404 not found as body
    }

    res.end(responseData.body);
  }

  async #getLambdaResponse(event, lambdaController, res) {
    return await new Promise(async (resolve, reject) => {
      const responseData = await lambdaController.invoke(event, res);

      resolve(responseData);
    });
  }

  #convertReqToAlbEvent(req) {
    const { method, headers, url } = req;

    const parsedURL = new URL(url, "http://localhost:3003");

    const albDefaultHeaders = {
      "x-forwarded-for": req.socket.remoteAddress,
      "x-forwarded-proto": "http",
      "x-forwarded-port": this.port,
    };

    let event = {
      headers: { ...albDefaultHeaders, ...headers },
      httpMethod: method,
      path: parsedURL.pathname,
      queryStringParameters: this.#paramsToObject(url),
      isBase64Encoded: false,
    };

    return event;
  }

  #paramsToObject(reqUrl) {
    const queryStartIndex = reqUrl.indexOf("?");
    if (queryStartIndex == -1) return {};

    let queryStringComponents = {};
    const queryString = reqUrl.slice(queryStartIndex + 1);
    const queryComponents = queryString.split("&");

    queryComponents.forEach((c) => {
      const [key, value] = c.split("=");

      queryStringComponents[key] = value;
    });

    return queryStringComponents;
  }

  async load(lambdaDefinitions) {
    try {
      for (const lambda of lambdaDefinitions) {
        const lambdaController = new LambdaMock(lambda);
        // await lambdaController.importEventHandler();

        switch (lambda.method) {
          case "POST":
            this.post(lambdaController);
            break;

          case "GET":
            this.get(lambdaController);
            break;

          case "PATCH":
            this.patch(lambdaController);
            break;

          case "PUT":
            this.put(lambdaController);
            break;

          case "DELETE":
            this.delete(lambdaController);
            break;

          default:
            break;
        }
      }
    } catch (error) {
      log.RED("JSON PARSER ERROR");
      console.error(error);
    }
  }
}
