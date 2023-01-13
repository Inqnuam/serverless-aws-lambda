import http, { Server, IncomingMessage, ServerResponse } from "http";
import { AddressInfo } from "net";
import { networkInterfaces } from "os";
import { AlbRouter, HttpMethod } from "./router";
import { ILambdaMock, LambdaMock } from "./lambdaMock";
import { log } from "./colorize";
import inspector from "inspector";
import { html404, html500 } from "./htmlStatusMsg";
import serveStatic from "serve-static";
import { randomUUID } from "crypto";
let localIp: string;

const accountId = Buffer.from(randomUUID()).toString("hex").slice(0, 16);
const apiId = Buffer.from(randomUUID()).toString("ascii").slice(0, 10);
if (networkInterfaces) {
  localIp = Object.values(networkInterfaces())
    .reduce((accum: any[], obj: any) => {
      accum.push(...obj);
      return accum;
    }, [])
    ?.filter((item) => !item.internal && item.family === "IPv4")
    .find(Boolean)?.address;
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
interface ApgEvent {
  version: string;
  routeKey: string;
  rawPath: string;
  rawQueryString: string;
  headers: { [key: string]: any };
  queryStringParameters: { [key: string]: string };
  multiValueHeaders: { [key: string]: any };
  multiValueQueryStringParameters: { [key: string]: any };
  isBase64Encoded: boolean;
  body?: string;
  requestContext: {
    accountId: string;
    apiId: string;
    domainName: string;
    domainPrefix: string;
    http: {
      method: string;
      path: string;
      protocol: string;
      sourceIp: string;
      userAgent: string;
    };
    requestId: string;
    routeKey: string;
    stage: string;
    time: string;
    timeEpoch: number;
  };
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
      process.send?.({ port: listeningPort });
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
      //SECTION: Route provided by client in config file
      customCallback(req, res);
    } else if (parsedURL.pathname.startsWith("/2015-03-31") || parsedURL.pathname.startsWith("/@invoke/")) {
      //SECTION: function invoke from aws-sdk lambda client or from /@invoke/
      const foundHandler = this.getHandlerByName(parsedURL.pathname);

      const invokeType = headers["x-amz-invocation-type"];
      const exceptedStatusCode = invokeType == "DryRun" ? 204 : invokeType == "Event" ? 202 : 200;

      if (foundHandler) {
        let event = "";
        let body: any = Buffer.alloc(0);

        req
          .on("data", (chunk) => {
            body += chunk;
          })
          .on("end", async () => {
            body = body.toString();

            let validBody = false;
            try {
              body = JSON.parse(body);
              validBody = true;
            } catch (error) {
              if (body && body.length) {
                validBody = false;
              } else {
                body = {};
                validBody = true;
              }
            }
            event = body;

            res.setHeader("Content-Type", "application/json");
            res.setHeader("x-amzn-RequestId", Buffer.from(randomUUID()).toString("base64"));
            res.setHeader("X-Amzn-Trace-Id", `root=1-xxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx;sampled=0`);

            if (validBody) {
              try {
                const result = await foundHandler.invoke(event, res, method!, url!, "raw");
                res.statusCode = exceptedStatusCode;

                res.end(JSON.stringify(result));
              } catch (error) {
                res.statusCode = 502;
                res.end(JSON.stringify(error));
              }
            } else {
              res.statusCode = 400;
              res.end(JSON.stringify({ Type: "User" }));
            }
          })
          .on("error", (err) => {
            res.statusCode = 502;
            res.end(JSON.stringify(err));
          });
      } else {
        res.statusCode = 404;
        res.end("Lambda not found");
      }
    } else {
      //SECTION: ALB and APG server
      let body = Buffer.alloc(0);
      let requestMockType: string | undefined | null = undefined;

      if (parsedURL.searchParams.get("x_mock_type") !== null) {
        requestMockType = parsedURL.searchParams.get("x_mock_type");
      } else if (headers["x-mock-type"]) {
        if (Array.isArray(headers["x-mock-type"])) {
          requestMockType = headers["x-mock-type"][0];
        } else {
          requestMockType = headers["x-mock-type"];
        }
      }

      const lambdaController = this.getHandler(method as HttpMethod, decodeURIComponent(parsedURL.pathname), requestMockType);

      if (lambdaController) {
        let mockType = "alb";

        if (lambdaController.endpoints.length == 1) {
          mockType = lambdaController.endpoints[0].kind;
        } else if (requestMockType) {
          mockType = requestMockType.toLowerCase();
        }
        let event = mockType == "alb" ? this.#convertReqToAlbEvent(req) : this.#convertReqToApgEvent(req);

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
            this.#responseHandler(res, event, lambdaController, method as HttpMethod, parsedURL.pathname, mockType);
          })
          .on("error", (err) => {
            console.error(err.stack);
          });
      } else if (this.#serve) {
        this.#serve(req, res, () => {
          res.setHeader("Content-Type", "text/html");
          res.statusCode = 404;
          res.end(html404);
        });
      } else {
        res.setHeader("Content-Type", "text/html");
        res.statusCode = 404;
        res.end(html404);
      }
    }
  }

  async #responseHandler(res: ServerResponse, event: any, lambdaController: ILambdaMock, method: HttpMethod, path: string, mockType: string) {
    const hrTimeStart = process.hrtime();

    res.on("close", () => {
      const endAt = process.hrtime(hrTimeStart);
      const execTime = `${endAt[0]},${endAt[1]}s`;
      const executedTime = `⌛️ '${lambdaController.name}' execution time: ${execTime}`;
      // NOTE: as main and worker process share the same stdout we need a timeout before printing any additionnal info
      setTimeout(() => {
        log.YELLOW(executedTime);
      }, 400);
    });
    try {
      const responseData = await lambdaController.invoke(event, res, method, path, mockType);
      if (!res.writableFinished) {
        this.#setResponseHead(res, responseData, mockType);
        if (!res.writableFinished) {
          this.#writeResponseBody(res, responseData, mockType);
        }
      }
    } catch (error) {
      if (!res.writableFinished) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "text/html");
        res.end(html500);
      }

      console.error(error);
    }
  }

  #setResponseHead(res: ServerResponse, responseData: any, mockType: string) {
    if (mockType == "alb") {
      res.setHeader("Server", "awselb/2.0");
    } else if (mockType == "apg") {
      res.setHeader("Apigw-Requestid", Buffer.from(randomUUID()).toString("base64").slice(0, 16));
    }

    res.setHeader("Date", new Date().toUTCString());

    if (responseData) {
      res.statusMessage = responseData.statusMessage ?? "";

      if (typeof responseData.headers == "object" && !Array.isArray(responseData.headers)) {
        const headersKeys = Object.keys(responseData.headers).filter((key) => key !== "Server" && key !== "Apigw-Requestid" && key !== "Date");
        headersKeys.forEach((key) => {
          res.setHeader(key, responseData.headers[key]);
        });
      }

      if (responseData) {
        if (!responseData.statusCode) {
          if (mockType == "alb") {
            console.log("Invalid 'statusCode'. ");
            res.statusCode = 502;
            res.setHeader("Content-Type", "text/html");
            res.end(html500);
          } else {
            res.statusCode = 200;
          }
        } else {
          res.statusCode = responseData.statusCode;
          if (responseData.cookies?.length) {
            res.setHeader("Set-Cookie", responseData.cookies);
          }
        }
      }
    } else {
      res.statusCode = mockType == "alb" ? 502 : 200;
    }
  }

  #writeResponseBody(res: ServerResponse, responseData: any, mockType: string) {
    let resContent = "";
    if (responseData) {
      if (typeof responseData.body == "string") {
        resContent = responseData.body;
      } else if (responseData.body) {
        console.log("response 'body' must be a string. Receievd", typeof responseData.body);
      } else {
        if (mockType == "apg") {
          res.setHeader("Content-Type", "application/json");
          if (typeof responseData == "string") {
            resContent = responseData;
          } else if (typeof responseData == "object") {
            resContent = JSON.stringify(responseData);
          }
        } else {
          log.RED("Invalid response content");
          res.setHeader("Content-Type", "text/html");
          res.statusCode = 502;
          resContent = html500;
        }
      }
    }
    res.end(resContent);
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
    const multiValueQueryStringParameters: any = {};

    for (const k of Array.from(new Set(parsedURL.searchParams.keys()))) {
      multiValueQueryStringParameters[k] = parsedURL.searchParams.getAll(k);
    }

    parsedURL.searchParams.delete("x_mock_type");
    let event: ApgEvent = {
      version: "2.0",
      routeKey: `${method} ${parsedURL.pathname}`,
      rawPath: parsedURL.pathname,
      rawQueryString: parsedURL.search ? parsedURL.search.slice(1) : "",
      headers: { ...albDefaultHeaders, ...headers },
      // @ts-ignore
      queryStringParameters: Object.fromEntries(parsedURL.searchParams),
      isBase64Encoded: false,
      multiValueHeaders: {},
      multiValueQueryStringParameters,
      requestContext: {
        accountId: String(accountId),
        apiId: apiId,
        domainName: `localhost:${this.port}`,
        domainPrefix: "localhost",
        http: {
          method: method as string,
          path: parsedURL.pathname,
          protocol: "HTTP/1.1",
          sourceIp: "127.0.0.1",
          userAgent: headers["user-agent"] ?? "",
        },
        requestId: "",
        routeKey: `${method} ${parsedURL.pathname}`,
        stage: "$local",
        time: new Date().toISOString(),
        timeEpoch: Date.now(),
      },
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

    delete queryStringComponents.x_mock_type;
    return queryStringComponents;
  }

  async load(lambdaDefinitions: ILambdaMock[]) {
    for (const lambda of lambdaDefinitions) {
      const lambdaController = new LambdaMock(lambda);

      this.addHandler(lambdaController);
    }
  }
}
