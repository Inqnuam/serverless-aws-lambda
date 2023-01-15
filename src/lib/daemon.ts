import http, { Server, IncomingMessage, ServerResponse } from "http";
import { AddressInfo } from "net";
import { networkInterfaces } from "os";
import { Handlers, HttpMethod } from "./router";
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
  requestContext: {
    elb: {
      targetGroupArn: string;
    };
  };
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
interface IDaemonConfig {
  debug: boolean;
}
export class Daemon extends Handlers {
  #server: Server;
  runtimeConfig = {};
  #serve: any;
  customOfflineRequests?: {
    filter: RegExp;
    callback: (req: any, res: any) => {};
  }[];
  onReady?: (port: number) => Promise<void> | void;
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

  #parseSnsPublishBody(encodedBody: string[]) {
    let body: any = {};

    try {
      let MessageAttributes: any = {};
      let entryMap: any = {};
      for (const s of encodedBody) {
        const [k, v] = s.split("=");
        if (k.startsWith("MessageAttributes")) {
          const [_, __, entryNumber, entryType, aux] = k.split(".");

          if (entryType == "Name") {
            MessageAttributes[v] = { Type: "", Value: "" };
            entryMap[entryNumber] = v;
          } else if (entryType == "Value") {
            if (aux == "DataType") {
              MessageAttributes[entryMap[entryNumber]].Type = v;
            } else {
              MessageAttributes[entryMap[entryNumber]].Value = v;
            }
          }
        } else {
          body[k] = v;
        }
      }
      if (Object.keys(MessageAttributes).length) {
        body.MessageAttributes = MessageAttributes;
      }
    } catch (error) {}

    if (body.MessageStructure == "json") {
      try {
        const parsedPsg = JSON.parse(body.Message);
        body.Message = parsedPsg.default;
      } catch (error) {
        throw new Error("Invalid body message");
      }
    }

    return body;
  }
  #parseSnsPublishBatchBody(encodedBody: string[]) {
    let body: any = {};
    let Ids = [];
    const uid = randomUUID();
    const Records = [];
    try {
      let memberMap = new Map();

      for (const s of encodedBody) {
        const [k, v] = s.split("=");

        if (k.startsWith("PublishBatchRequestEntries")) {
          const [_, __, memberNumber, entryType, aux, entryNumber, aux2, aux3] = k.split(".");

          const foundMember = memberMap.get(memberNumber);
          if (foundMember) {
            if (entryType == "Message" || entryType == "MessageStructure" || entryType == "Subject" || entryType == "Id") {
              foundMember.value[entryType] = v;
            } else if (entryType == "MessageAttributes") {
              const attribName = foundMember.attributes[entryNumber];
              if (attribName) {
                foundMember.value.MessageAttributes[attribName][aux3 == "DataType" ? "Type" : "Value"] = v;
              } else {
                foundMember.attributes[entryNumber] = v;

                if (foundMember.value.MessageAttributes) {
                  foundMember.value.MessageAttributes[v] = {};
                } else {
                  foundMember.value.MessageAttributes = {
                    [v]: {},
                  };
                }
              }
            }
          } else {
            let content: any = {
              attributes: {},
              value: {},
            };
            if (entryType == "Message" || entryType == "MessageStructure" || entryType == "Subject" || entryType == "Id") {
              content.value[entryType] = v;
            } else if (entryType == "MessageAttributes") {
              content.attributes[entryNumber] = v;
              content.value.MessageAttributes = {
                [v]: {},
              };
            }

            memberMap.set(memberNumber, content);
          }
        } else {
          body[k] = v;
        }
      }

      for (let v of memberMap.values()) {
        let Sns: any = {
          Type: "Notification",
          MessageId: randomUUID(),
          TopicArn: body.TopicArn,
          Subject: v.value.Subject ?? null,
          Message: v.value.Message,
          Timestamp: new Date().toISOString(),
          SignatureVersion: "1",
          Signature: "fake",
          SigningCertUrl: "fake",
          UnsubscribeUrl: "fake",
        };

        if (Object.keys(v.value.MessageAttributes).length) {
          Sns.MessageAttributes = v.value.MessageAttributes;
        }

        if (v.value.MessageStructure == "json") {
          try {
            Sns.Message = JSON.parse(v.value.Message).default;
          } catch (error) {
            log.RED("Can't parse SNS message json body");
          }
        }
        const e = { EventSource: "aws:sns", EventVersion: "1.0", EventSubscriptionArn: `${body.TopicArn}:${uid}`, Sns };

        Ids.push(v.value.Id);
        Records.push(e);
      }
    } catch (error) {
      console.log(error);
    }

    return { Records, Ids };
  }
  #createSnsTopicEvent(body: any, MessageId: string) {
    return {
      Records: [
        {
          EventSource: "aws:sns",
          EventVersion: "1.0",
          EventSubscriptionArn: body.TopicArn,
          Sns: {
            Type: "Notification",
            MessageId,
            TopicArn: body.TopicArn,
            Subject: body.Subject ?? null,
            Message: body.Message,
            Timestamp: new Date().toISOString(),
            SignatureVersion: "1",
            Signature: "fake",
            SigningCertUrl: "fake",
            UnsubscribeUrl: "fake",
            MessageAttributes: body.MessageAttributes,
          },
        },
      ],
    };
  }
  #genSnsPublishResponse(MessageId: string, RequestId: string) {
    return `<PublishResponse xmlns="http://sns.amazonaws.com/doc/2010-03-31/">
    <PublishResult>
      <MessageId>${MessageId}</MessageId>
    </PublishResult>
    <ResponseMetadata>
      <RequestId>${RequestId}</RequestId>
    </ResponseMetadata>
  </PublishResponse>`;
  }
  #genSnsPublishBatchResponse(RequestId: string, Successful: any[], Failed: any[]) {
    let successContent = "<Successful/>";
    let failedContent = "<Failed/>";

    if (Successful.length) {
      const content = Successful.map(
        (x) => `<member>
  <MessageId>${x.MessageId}</MessageId>
  <Id>${x.Id}</Id>
</member>`
      ).join("\n");

      successContent = `<Successful>
${content}
</Successful>`;
    }

    if (Failed.length) {
      const content = Successful.map(
        (x) => `<member>
  <MessageId>${x.MessageId}</MessageId>
  <Id>${x.Id}</Id>
</member>`
      ).join("\n");

      failedContent = `<Failed>
${content}
</Failed>`;
    }
    return `<PublishBatchResponse xmlns="http://sns.amazonaws.com/doc/2010-03-31/">
    <PublishBatchResult>
      ${failedContent}
      ${successContent}
    </PublishBatchResult>
    <ResponseMetadata>
      <RequestId>${RequestId}</RequestId>
    </ResponseMetadata>
  </PublishBatchResponse>`;
  }
  #handleSnsInvoke(req: IncomingMessage, res: ServerResponse) {
    let data = Buffer.alloc(0);
    const MessageId = randomUUID();
    const RequestId = req.headers["amz-sdk-invocation-id"] ?? randomUUID();

    req.on("data", (chunk) => {
      data += chunk;
    });

    req.on("end", async () => {
      const encodedBody = decodeURIComponent(data.toString())?.split("&");

      const Action = encodedBody.find((x) => x.startsWith("Action="))?.split("=")[1];

      if (!Action) {
        return;
      }

      if (Action == "Publish") {
        const body = this.#parseSnsPublishBody(encodedBody);

        const foundHandlers = this.getHandlersByTopicArn(body);
        const deduplicatedHandler: ILambdaMock[] = [];
        if (foundHandlers.length) {
          const event = this.#createSnsTopicEvent(body, MessageId);
          foundHandlers.forEach((l) => {
            if (!deduplicatedHandler.find((x) => x.name == l.name)) {
              deduplicatedHandler.push(l);
            }
          });

          for (const l of deduplicatedHandler) {
            await l.invoke(event);
          }
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "text/xml");

        const snsResponse = this.#genSnsPublishResponse(MessageId, Array.isArray(RequestId) ? RequestId[0] : RequestId);
        res.end(snsResponse);
      } else if (Action == "PublishBatch") {
        const body = this.#parseSnsPublishBatchBody(encodedBody);

        const Successful: any = [];
        const Failed: any = [];
        let handlers: ILambdaMock[] = [];

        body.Records.forEach((x, index) => {
          const foundHandlers = this.getHandlersByTopicArn(x.Sns);

          const Id = body.Ids[index];
          if (foundHandlers.length) {
            Successful.push({ Id, MessageId: x.Sns.MessageId });

            foundHandlers.forEach((l) => {
              if (!handlers.find((x) => x.name == l.name)) {
                handlers.push(l);
              }
            });
          } else {
            Failed.push({ Id, MessageId: x.Sns.MessageId });
          }
        });

        for (const l of handlers) {
          await l.invoke({ Records: body.Records });
        }
        res.statusCode = 200;
        res.setHeader("x-amzn-requestid", randomUUID());
        res.setHeader("Content-Type", "text/xml");
        const snsResponse = this.#genSnsPublishBatchResponse(Array.isArray(RequestId) ? RequestId[0] : RequestId, Successful, Failed);
        res.end(snsResponse);
      } else {
        res.statusCode = 502;
        res.setHeader("Content-Type", "text/xml");
        res.end("Internal Server Error");
      }
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
      this.#handleCustomInvoke(req, res, parsedURL);
    } else if (method == "POST" && parsedURL.pathname.startsWith("/@sns/")) {
      this.#handleSnsInvoke(req, res);
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
      const date = new Date();
      const awsRequestId = randomUUID();
      log.CYAN(`${date.toLocaleDateString()} ${date.toLocaleTimeString()} requestId: ${awsRequestId} | '${lambdaController.name}' ${method} ${path}`);
      const responseData = await lambdaController.invoke(event);

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
            console.log("Invalid 'statusCode'.\nALB Lambdas must return a valid 'statusCode' value");
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
      requestContext: {
        elb: {
          targetGroupArn: "arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/lambda-279XGJDqGZ5rsrHC2Fjr/49e9d65c45c6791a",
        },
      },
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
