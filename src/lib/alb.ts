import http, { Server, IncomingMessage, ServerResponse } from "http";
import { AddressInfo } from "net";
import { networkInterfaces } from "os";
import { AlbRouter, HttpMethod } from "./router";
import { ILambdaMock, LambdaMock } from "./lambdaMock";
import { log } from "./colorize";
import inspector from "inspector";
import { html404, html500 } from "./htmlStatusMsg";
import serveStatic from "serve-static";

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
  #serve: any;
  customOfflineRequests?: {
    filter: RegExp;
    callback: (req: any, res: any) => {};
  }[];
  constructor(config = { debug: false }) {
    super(config);
    this.#server = http.createServer(this.#requestListener.bind(this));
  }
  get port() {
    return AlbRouter.PORT;
  }

  set serve(root: string) {
    this.#serve = serveStatic(root);
  }
  listen(port = 0, callback?: Function) {
    if (isNaN(port)) {
      throw Error("port should be a number");
    }
    this.#server.listen(port, () => {
      const { port: listeningPort } = this.#server.address() as AddressInfo;
      AlbRouter.PORT = listeningPort;
      if (typeof callback == "function") {
        callback(listeningPort, localIp);
      } else {
        let output = `✅ AWS Lambda offline server is listening on http://localhost:${listeningPort}`;

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

    let customCallback: ((req: any, res: any) => {}) | undefined;

    if (this.customOfflineRequests) {
      const foundCustomCallback = this.customOfflineRequests.find((x) => x.filter.test(parsedURL.pathname));

      customCallback = foundCustomCallback?.callback;
    }

    if (customCallback) {
      customCallback(req, res);
    } else {
      const mockType = (headers["x-mock-type"] ?? "alb") as string;
      let body = Buffer.alloc(0);

      const contentType = headers["content-type"];
      let event = mockType == "alb" ? this.#convertReqToAlbEvent(req) : this.#convertReqToApgEvent(req);

      const lambdaController = this.getHandler(method as HttpMethod, parsedURL.pathname, mockType);

      if (lambdaController) {
        if (this.debug) {
          log.YELLOW(`${mockType.toUpperCase()} event`);
          console.log(event);
        }
        req
          .on("data", (chunk) => {
            body += chunk;
          })
          .on("end", async () => {
            event.body = body.length ? body.toString() : "";
            this.#responseHandler(res, event, lambdaController, method as HttpMethod, parsedURL.pathname);
          })
          .on("error", (err) => {
            console.error(err.stack);
          });
      } else if (this.#serve) {
        this.#serve(req, res, () => {
          res.statusCode = 404;
          res.end(html404);
        });
      } else {
        res.statusCode = 404;
        res.end(html404);
      }
    }
  }

  async #responseHandler(res: ServerResponse, event: any, lambdaController: ILambdaMock, method: HttpMethod, path: string) {
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
      const responseData = await this.#getLambdaResponse(event, lambdaController, res, method, path);
      if (!res.writableFinished) {
        this.#setResponseHead(res, responseData);
        this.#writeResponseBody(res, responseData);
      }
    } catch (error) {
      if (!res.writableFinished) {
        res.statusCode = 500;
        res.end(html500);
      }

      console.error(error);
    }
  }

  #setResponseHead(res: ServerResponse, responseData: any) {
    res.setHeader("Server", "awselb/2.0");
    res.setHeader("Date", new Date().toUTCString());

    if (responseData) {
      res.statusCode = responseData.statusCode ?? 200;
      res.statusMessage = responseData.statusMessage ?? "";

      if (typeof responseData.headers == "object" && !Array.isArray(responseData.headers)) {
        const headersKeys = Object.keys(responseData.headers).filter((key) => key !== "Server" && key !== "Date");
        headersKeys.forEach((key) => {
          res.setHeader(key, responseData.headers[key]);
        });
      }

      if (responseData) {
        if (responseData.cookies?.length) {
          res.setHeader("Set-Cookie", responseData.cookies);
        }

        if (!responseData.statusCode) {
          console.warn("Invalid 'statusCode'. default 200 is sent to client");
        }
      }
    } else {
      res.statusCode = 200;
    }
  }

  #writeResponseBody(res: ServerResponse, responseData: any) {
    if (responseData) {
      if (responseData.body && typeof responseData.body != "string") {
        console.warn("response 'body' must be a string. Receievd", typeof responseData.body);
        responseData.body = "";

        // TODO: if statudCode 404 send html 404 not found as body
      }

      res.end(responseData.body);
    } else {
      res.end("");
    }
  }

  async #getLambdaResponse(event: any, lambdaController: ILambdaMock, res: ServerResponse, method: HttpMethod, path: string) {
    return await new Promise(async (resolve, reject) => {
      const responseData = await lambdaController.invoke(event, res, method, path);

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
      queryStringParameters: this.#paramsToAlbObject(url as string),
      isBase64Encoded: false,
    };

    if (event.headers["x-mock-type"]) {
      delete event.headers["x-mock-type"];
    }
    if (headers["content-type"]?.includes("multipart/form-data")) {
      event.isBase64Encoded = true;
    }

    return event;
  }

  #convertReqToApgEvent(req: IncomingMessage) {
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
      queryStringParameters: this.#paramsToAlbObject(url as string),
      isBase64Encoded: false,
    };
    if (event.headers["x-mock-type"]) {
      delete event.headers["x-mock-type"];
    }
    if (headers["content-type"]?.includes("multipart/form-data")) {
      event.isBase64Encoded = true;
    }

    return event;
  }

  #paramsToAlbObject(reqUrl: string) {
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
    for (const lambda of lambdaDefinitions) {
      const lambdaController = new LambdaMock(lambda);

      this.addHandler(lambdaController);
    }
  }
}
