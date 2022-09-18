import http, { Server, IncomingMessage, ServerResponse } from "http";
import { AddressInfo } from "net";
import { networkInterfaces } from "os";
import { AlbRouter, HttpMethod } from "./router";
import { ILambdaMock, LambdaMock } from "./lambda";
import { log } from "./colorize";
import inspector from "inspector";

let localIp: string;

if (networkInterfaces) {
  // @ts-ignore
  localIp = Object.values(networkInterfaces())
    ?.flat()
    // @ts-ignore
    .filter((item) => !item.internal && item.family === "IPv4")
    .find(Boolean).address;
}

const debuggerIsAttached = inspector.url() != undefined;

if (debuggerIsAttached) {
  console.warn("Lambdas timeout are disabled when a Debugger is attached");
}

interface AlbEvent {
  headers: { [key: string]: any };
  httpMethod: string;
  path: string;
  queryStringParameters: { [key: string]: string };
  isBase64Encoded: boolean;
  body?: string;
}

export class ApplicationLoadBalancer extends AlbRouter {
  #server: Server;
  runtimeConfig = {};
  constructor(config = { debug: false }) {
    super(config);
    this.#server = http.createServer(this.#requestListener.bind(this));
  }
  get port() {
    return AlbRouter.PORT;
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
  listen(port = 0, callback?: Function) {
    if (isNaN(port)) {
      throw Error("port should be a number");
    }
    this.#server.listen(port, () => {
      const { port: listeningPort } = this.#server.address() as AddressInfo;
      AlbRouter.PORT = listeningPort;
      if (typeof callback == "function") {
        callback(listeningPort);
      } else {
        let output = `✅ Application Load Balancer is listening on http://localhost:${listeningPort}`;

        if (localIp) {
          output += ` | http://${localIp}:${listeningPort}`;
        }

        log.GREEN(output);
      }
    });
  }

  #requestListener(req: IncomingMessage, res: ServerResponse) {
    const { url, method, headers } = req;

    const parsedURL = new URL(url as string, "http://localhost:3003");
    let body = Buffer.alloc(0);

    const contentType = headers["content-type"];
    let event = this.#convertReqToAlbEvent(req);

    if (this.debug) {
      log.YELLOW("ALB event:");
      console.log(event);
    }
    const lambdaController = this.getHandler(method as HttpMethod, parsedURL.pathname);

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

  async #responseHandler(res: ServerResponse, event: any, lambdaController: ILambdaMock) {
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

  #setResponseHead(res: ServerResponse, responseData: any) {
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
      console.warn("Invalid 'statusCode'. default 200 is sent to client");
    }
  }

  #writeResponseBody(res: ServerResponse, responseData: any) {
    // && res.statusCode && String(res.statusCode).startsWith("2")
    if (responseData.body && typeof responseData.body != "string") {
      console.warn("response 'body' must be a string. Receievd", typeof responseData.body);
      responseData.body = "";

      // TODO: if statudCode 404 send html 404 not found as body
    }

    res.end(responseData.body);
  }

  async #getLambdaResponse(event: any, lambdaController: ILambdaMock, res: ServerResponse) {
    return await new Promise(async (resolve, reject) => {
      const responseData = await lambdaController.invoke(event, res);

      resolve(responseData);
    });
  }

  #convertReqToAlbEvent(req: IncomingMessage) {
    const { method, headers, url } = req;

    const parsedURL = new URL(url as string, "http://localhost:3003");

    const albDefaultHeaders = {
      "x-forwarded-for": req.socket.remoteAddress,
      "x-forwarded-proto": "http",
      "x-forwarded-port": this.port,
    };

    let event: AlbEvent = {
      headers: { ...albDefaultHeaders, ...headers },
      httpMethod: method as string,
      path: parsedURL.pathname,
      queryStringParameters: this.#paramsToObject(url as string),
      isBase64Encoded: false,
    };

    if (headers["content-type"]?.includes("multipart/form-data")) {
      event.isBase64Encoded = true;
    }

    return event;
  }

  #paramsToObject(reqUrl: string) {
    const queryStartIndex = reqUrl.indexOf("?");
    if (queryStartIndex == -1) return {};

    let queryStringComponents: any = {};
    const queryString = reqUrl.slice(queryStartIndex + 1);
    const queryComponents = queryString.split("&");

    queryComponents.forEach((c) => {
      const [key, value] = c.split("=");

      queryStringComponents[key] = value;
    });

    return queryStringComponents;
  }

  async load(lambdaDefinitions: ILambdaMock[]) {
    for (const lambda of lambdaDefinitions.filter((x) => x.kind == "ALB")) {
      const lambdaController = new LambdaMock(lambda);

      if (typeof this[lambda.method] == "function") {
        this[lambda.method](lambdaController);
      }
    }
  }
}
