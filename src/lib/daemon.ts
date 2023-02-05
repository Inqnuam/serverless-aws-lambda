import http, { Server, IncomingMessage, ServerResponse } from "http";
import { AddressInfo } from "net";
import { networkInterfaces } from "os";
import { Handlers, HttpMethod } from "./handlers";
import { ILambdaMock, LambdaMock, LambdaEndpoint } from "./lambdaMock";
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
  requestContext: {
    elb: {
      targetGroupArn: string;
    };
  };
  multiValueHeaders?: {
    [key: string]: string[];
  };

  multiValueQueryStringParameters?: {
    [key: string]: string[];
  };
  queryStringParameters?: { [key: string]: string };
  headers?: { [key: string]: any };
  httpMethod: string;
  path: string;
  isBase64Encoded: boolean;
  body?: string;
}

interface CommonApgEvent {
  version: string;
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
  queryStringParameters: { [key: string]: string };
  isBase64Encoded: boolean;
  headers: { [key: string]: any };
  pathParameters?: { [key: string]: any };
}

type ApgHttpApiEvent = {
  routeKey: string;
  rawPath: string;
  rawQueryString: string;
  cookies?: string[];
} & CommonApgEvent;

type ApgHttpEvent = {
  resource: string;
  path: string;
  httpMethod: string;
  multiValueHeaders: { [key: string]: any };
  multiValueQueryStringParameters: { [key: string]: any };
} & CommonApgEvent;

interface IDaemonConfig {
  debug: boolean;
}
export class Daemon extends Handlers {
  #server: Server;
  runtimeConfig = {};
  #serve: any;
  customOfflineRequests?: {
    method?: string | string[];
    filter: RegExp | string;
    callback: (req: any, res: any) => {};
  }[];
  onReady?: (port: number) => Promise<void> | void;
  stop(cb: (err?: any) => void) {
    this.#server.close(cb);
  }
  constructor(config: IDaemonConfig = { debug: false }) {
    super(config);
    this.#server = http.createServer(this.#requestListener.bind(this));
  }
  get port() {
    return Handlers.PORT;
  }

  set serve(root: string) {
    this.#serve = serveStatic(root);
  }
  listen(port = 0, callback?: Function) {
    if (isNaN(port)) {
      throw Error("port should be a number");
    }
    this.#server.listen(port, async () => {
      const { port: listeningPort } = this.#server.address() as AddressInfo;
      Handlers.PORT = listeningPort;
      if (typeof callback == "function") {
        callback(listeningPort, localIp);
      } else {
        let output = `✅ AWS Lambda offline server is listening on http://localhost:${listeningPort}`;

        if (localIp) {
          output += ` | http://${localIp}:${listeningPort}`;
        }

        log.GREEN(output);
      }
      try {
        await this.onReady?.(listeningPort);
      } catch (error) {
        console.error(error);
      }
      process.send?.({ port: listeningPort });
    });
  }

  #handleCustomInvoke(req: IncomingMessage, res: ServerResponse, parsedURL: URL) {
    const { url, method, headers } = req;

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
              const date = new Date();
              const awsRequestId = randomUUID();
              log.CYAN(`${date.toLocaleDateString()} ${date.toLocaleTimeString()} requestId: ${awsRequestId} | '${foundHandler.name}' ${method}`);
              const result = await foundHandler.invoke(event);
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
  }
  #findCustomOfflineRequest(method: string, pathname: string) {
    if (!this.customOfflineRequests) {
      return;
    }
    const foundCustomCallback = this.customOfflineRequests.find((x) => {
      let validPath = false;
      let validMethod = true;
      if (typeof x.filter == "string") {
        if (!x.filter.endsWith("/")) {
          x.filter += "/";
        }
        validPath = x.filter == pathname;
      } else if (x.filter instanceof RegExp) {
        validPath = x.filter.test(pathname);
      }
      if (typeof x.method == "string" && x.method.toUpperCase() != "ANY") {
        validMethod = x.method.toUpperCase() == method;
      } else if (Array.isArray(x.method)) {
        const foundAny = x.method.findIndex((x) => x.toUpperCase() == "ANY") !== -1;
        if (!foundAny) {
          validMethod = x.method.findIndex((x) => x.toUpperCase() == method) !== -1;
        }
      }

      return validPath && validMethod;
    });
    if (foundCustomCallback) {
      return foundCustomCallback.callback;
    }
  }
  #requestListener(req: IncomingMessage, res: ServerResponse) {
    const { url, method, headers } = req;
    const parsedURL = new URL(url as string, "http://localhost:3003");

    const customCallback = this.#findCustomOfflineRequest(method!, parsedURL.pathname);

    if (customCallback) {
      //SECTION: Route provided by client in config file and/or by plugins
      customCallback(req, res);
    } else if (parsedURL.pathname.startsWith("/2015-03-31") || parsedURL.pathname.startsWith("/@invoke/")) {
      //SECTION: function invoke from aws-sdk lambda client or from /@invoke/
      this.#handleCustomInvoke(req, res, parsedURL);
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
        const mockEvent = lambdaController.event;

        let event = mockEvent.kind == "alb" ? this.#convertReqToAlbEvent(req, mockEvent) : this.#convertReqToApgEvent(req, mockEvent, lambdaController.handler.outName);

        req
          .on("data", (chunk) => {
            body += chunk;
          })
          .on("end", async () => {
            const isBase64 = headers["content-type"]?.includes("multipart/form-data");
            event.body = body.length ? body.toString() : mockEvent.kind == "alb" ? "" : undefined;

            if (isBase64 && event.body) {
              event.body = Buffer.from(event.body).toString("base64");
            }

            if (this.debug) {
              log.YELLOW(`${mockEvent.kind.toUpperCase()} event`);
              console.log(event);
            }
            this.#responseHandler(res, event, lambdaController.handler, method as HttpMethod, parsedURL.pathname, mockEvent);
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

  async #responseHandler(res: ServerResponse, event: any, lambdaController: ILambdaMock, method: HttpMethod, path: string, mockEvent: LambdaEndpoint) {
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
      const date = new Date();
      const awsRequestId = randomUUID();
      log.CYAN(`${date.toLocaleDateString()} ${date.toLocaleTimeString()} requestId: ${awsRequestId} | '${lambdaController.name}' ${method} ${path}`);

      if (mockEvent.async) {
        res.statusCode = 200;
        res.end();
      }
      const responseData = await lambdaController.invoke(event);
      if (!res.writableFinished) {
        this.#setResponseHead(res, responseData, mockEvent);
        if (!res.writableFinished) {
          this.#writeResponseBody(res, responseData, mockEvent.kind);
        }
      }
    } catch (error) {
      if (!res.writableFinished) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "text/html");
        res.end(html500);
      }
    }
  }

  #setResponseHead(res: ServerResponse, responseData: any, mockEvent: LambdaEndpoint) {
    if (mockEvent.kind == "alb") {
      res.setHeader("Server", "awselb/2.0");
      const { statusDescription } = responseData;
      if (typeof responseData.statusCode == "number" && typeof statusDescription == "string") {
        const descComponents = statusDescription.split(" ");
        if (isNaN(descComponents[0] as unknown as number)) {
          log.RED("statusDescription must start with a statusCode number followed by a space + status description text");
          log.YELLOW("example: '200 Found'");
        } else {
          const desc = descComponents.slice(1).join(" ");
          if (desc.length) {
            res.statusMessage = desc;
          }
        }
      }
    } else if (mockEvent.kind == "apg") {
      res.setHeader("Apigw-Requestid", Buffer.from(randomUUID()).toString("base64").slice(0, 16));
    }

    res.setHeader("Date", new Date().toUTCString());

    if (responseData) {
      if (mockEvent.kind == "alb") {
        if (mockEvent.multiValueHeaders) {
          if (responseData.multiValueHeaders) {
            const headersKeys = Object.keys(responseData.multiValueHeaders).filter((key) => key !== "Server" && key !== "Apigw-Requestid" && key !== "Date");
            headersKeys.forEach((key) => {
              if (Array.isArray(responseData.multiValueHeaders[key])) {
                res.setHeader(key, responseData.multiValueHeaders[key]);
              } else {
                log.RED("multiValueHeaders values must be an array");
                log.YELLOW("example:");
                log.GREEN("'Content-Type': ['application/json']");
              }
            });
          } else if (responseData.headers) {
            log.RED("An ALB Lambda with 'multiValueHeaders enabled' must return 'multiValueHeaders' instead of 'headers'");
            res.statusCode = 502;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end(html500);
          }
        } else {
          if (typeof responseData.headers == "object" && !Array.isArray(responseData.headers)) {
            const headersKeys = Object.keys(responseData.headers).filter((key) => key !== "Server" && key !== "Apigw-Requestid" && key !== "Date");
            headersKeys.forEach((key) => {
              res.setHeader(key, responseData.headers[key]);
            });
          }
        }
      } else {
        if (typeof responseData.headers == "object" && !Array.isArray(responseData.headers)) {
          const headersKeys = Object.keys(responseData.headers).filter((key) => key !== "Server" && key !== "Apigw-Requestid" && key !== "Date");
          headersKeys.forEach((key) => {
            res.setHeader(key, responseData.headers[key]);
          });
        }

        if (mockEvent.version == 1 && responseData.multiValueHeaders) {
          const headersKeys = Object.keys(responseData.multiValueHeaders).filter((key) => key !== "Server" && key !== "Apigw-Requestid" && key !== "Date");
          headersKeys.forEach((key) => {
            if (Array.isArray(responseData.multiValueHeaders[key])) {
              res.setHeader(key, responseData.multiValueHeaders[key]);
            } else {
              log.RED("multiValueHeaders values must be an array");
              log.YELLOW("example:");
              log.GREEN("'Content-Type': ['application/json']");
            }
          });
        }
      }

      if (!responseData.statusCode) {
        if (mockEvent.kind == "alb") {
          log.RED("Invalid 'statusCode'.\nALB Lambdas must return a valid 'statusCode' number");
          res.statusCode = 502;
          res.setHeader("Content-Type", "text/html");
          res.end(html500);
        } else {
          res.statusCode = 200;
        }
      } else {
        if (mockEvent.kind == "alb") {
          if (typeof responseData.statusCode == "number") {
            res.statusCode = responseData.statusCode;
          } else {
            log.RED("Invalid 'statusCode'.\nALB Lambdas must return a valid 'statusCode' number");
            res.statusCode = 502;
          }
        } else {
          res.statusCode = responseData.statusCode;
        }

        if (responseData.cookies?.length) {
          if (mockEvent.version == 2) {
            res.setHeader("Set-Cookie", responseData.cookies);
          } else {
            log.RED(`'cookies' as return value is supported only in API Gateway HTTP API (httpApi).\nUse 'Set-Cookie' header instead`);
          }
        }
      }
    } else {
      res.statusCode = mockEvent.kind == "alb" ? 502 : 200;
    }
  }

  #writeResponseBody(res: ServerResponse, responseData: any, mockEvent: string) {
    let resContent = "";
    if (responseData) {
      if (typeof responseData.body == "string") {
        resContent = responseData.body;
      } else if (responseData.body) {
        console.log("response 'body' must be a string. Receievd", typeof responseData.body);
      } else {
        if (mockEvent == "apg") {
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

  #getMultiValueHeaders(rawHeaders: string[]) {
    let multiValueHeaders: any = {};
    const multiKeys = rawHeaders.filter((x, i) => i % 2 == 0).map((x) => x.toLowerCase());
    const multiValues = rawHeaders.filter((x, i) => i % 2 !== 0);

    multiKeys.forEach((x, i) => {
      if (x == "x-mock-type") {
        return;
      }
      if (multiValueHeaders[x]) {
        multiValueHeaders[x].push(multiValues[i]);
      } else {
        multiValueHeaders[x] = [multiValues[i]];
      }
    });

    return multiValueHeaders;
  }
  #convertReqToAlbEvent(req: IncomingMessage, mockEvent: LambdaEndpoint) {
    const { method, headers, url, rawHeaders } = req;

    const parsedURL = new URL(url as string, "http://localhost:3003");

    let event: Partial<AlbEvent> = {
      requestContext: {
        elb: {
          targetGroupArn: "arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/lambda-279XGJDqGZ5rsrHC2Fjr/49e9d65c45c6791a",
        },
      },
      httpMethod: method as string,
      path: parsedURL.pathname,
      isBase64Encoded: false,
    };

    if (mockEvent.multiValueHeaders) {
      event.multiValueHeaders = {
        "x-forwarded-for": [String(req.socket.remoteAddress)],
        "x-forwarded-proto": ["http"],
        "x-forwarded-port": [String(this.port)],
        ...this.#getMultiValueHeaders(rawHeaders),
      };

      event.multiValueQueryStringParameters = {};

      const parsedURL = new URL(url as string, "http://localhost:3003");
      parsedURL.searchParams.delete("x_mock_type");

      for (const k of Array.from(new Set(parsedURL.searchParams.keys()))) {
        event.multiValueQueryStringParameters[k] = parsedURL.searchParams.getAll(k).map(encodeURI);
      }
    } else {
      event.headers = {
        "x-forwarded-for": req.socket.remoteAddress,
        "x-forwarded-proto": "http",
        "x-forwarded-port": this.port,
        ...headers,
      };
      event.queryStringParameters = this.#paramsToAlbObject(url as string);

      if (event.headers["x-mock-type"]) {
        delete event.headers["x-mock-type"];
      }
      if (headers["content-type"]?.includes("multipart/form-data")) {
        event.isBase64Encoded = true;
      }
    }
    return event;
  }

  #convertReqToApgEvent(req: IncomingMessage, mockEvent: LambdaEndpoint, lambdaName: string): ApgHttpApiEvent | ApgHttpEvent {
    const { method, headers, url, rawHeaders } = req;

    const parsedURL = new URL(url as string, "http://localhost:3003");
    parsedURL.searchParams.delete("x_mock_type");

    const paramDeclarations = mockEvent.paths[0].split("/");
    const reqParams = parsedURL.pathname.split("/");

    let pathParameters: any = {};

    paramDeclarations.forEach((k, i) => {
      if (k.startsWith("{") && k.endsWith("}")) {
        pathParameters[k.slice(1, -1)] = reqParams[i];
      }
    });
    const requestContext = {
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
    };

    const customHeaders: any = { "x-forwarded-for": req.socket.remoteAddress, "x-forwarded-proto": "http", "x-forwarded-port": this.port, ...headers };

    let event: any;
    if (mockEvent.version == 1) {
      const multiValueQueryStringParameters: any = {};

      for (const k of Array.from(new Set(parsedURL.searchParams.keys()))) {
        multiValueQueryStringParameters[k] = parsedURL.searchParams.getAll(k);
      }
      const multiValueHeaders = {
        "x-forwarded-for": [String(req.socket.remoteAddress)],
        "x-forwarded-proto": ["http"],
        "x-forwarded-port": [String(this.port)],
        ...this.#getMultiValueHeaders(rawHeaders),
      };
      const apgEvent: ApgHttpEvent = {
        version: "1.0",
        resource: `/${lambdaName}`,
        path: parsedURL.pathname,
        httpMethod: method!,
        headers: customHeaders,
        multiValueHeaders,
        // @ts-ignore
        queryStringParameters: Object.fromEntries(parsedURL.searchParams),
        multiValueQueryStringParameters,
        requestContext,
        isBase64Encoded: false,
      };
      if (Object.keys(pathParameters).length) {
        apgEvent.pathParameters = pathParameters;
      }
      event = apgEvent;
    } else {
      const customMethod = mockEvent.methods.find((x) => x == method) ?? "ANY";

      let queryStringParameters: any = {};
      let rawQueryString = "";
      for (const k of Array.from(new Set(parsedURL.searchParams.keys()))) {
        const values = parsedURL.searchParams.getAll(k);

        rawQueryString += `&${values.map((x) => encodeURI(`${k}=${x}`)).join("&")}`;
        queryStringParameters[k] = values.join(",");
      }
      if (rawQueryString) {
        rawQueryString = rawQueryString.slice(1);
      }

      const apgEvent: ApgHttpApiEvent = {
        version: "2.0",
        routeKey: `${customMethod} ${parsedURL.pathname}`,
        rawPath: parsedURL.pathname,
        rawQueryString,
        headers: customHeaders,
        queryStringParameters,
        isBase64Encoded: false,
        requestContext,
      };
      if (Object.keys(pathParameters).length) {
        apgEvent.pathParameters = pathParameters;
      }
      if (headers.cookie) {
        apgEvent.cookies = headers.cookie.split("; ");
      }

      event = apgEvent;
    }
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
