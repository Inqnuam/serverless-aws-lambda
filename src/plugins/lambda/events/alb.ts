import { CommonEventGenerator } from "./common";
import { IncomingMessage, ServerResponse } from "http";
import type { LambdaEndpoint } from "../../../lib/parseEvents/endpoints";
import { log } from "../../../lib/utils/colorize";
import { html502 } from "../htmlStatusMsg";

interface AlbPayload {
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

export class AlbRequestHandler extends CommonEventGenerator {
  res: ServerResponse;
  payload: AlbPayload;
  mockEvent: LambdaEndpoint;
  constructor({
    res,
    req,
    body,
    mockEvent,
    multiValueHeaders,
    isBase64Encoded,
    lambdaName,
  }: {
    res: ServerResponse;
    req: IncomingMessage;
    body: any;
    mockEvent: LambdaEndpoint;
    multiValueHeaders: any;
    isBase64Encoded: boolean;
    lambdaName: string;
  }) {
    super();
    this.res = res;
    this.mockEvent = mockEvent;
    this.payload = AlbRequestHandler.#generatePayload({ req, mockEvent, multiValueHeaders, isBase64Encoded, body, lambdaName });
  }
  static #execError = new Error();
  returnError = () => {
    if (this.res.writableFinished) {
      return true;
    }

    this.res.shouldKeepAlive = false;
    this.res.writeHead(502, [["Server", "awselb/2.0"], ["Date", new Date().toUTCString()], ["Content-Type", "text/html"], ["Content-Length", "110"], AlbRequestHandler.keepAlive]);

    return this.res.end(html502);
  };
  sendResponse = (output?: any) => {
    const headers = [
      ["Server", "awselb/2.0"],
      ["Date", new Date().toUTCString()],
    ];
    const customHeaders: [string, string][] = [];
    let code = 200;
    let statusMessage = undefined;

    if (!output || typeof output.statusCode !== "number") {
      log.RED("Valid ALB Lambda response must be an object which includes a valid 'statusCode' number.\nReceived:");
      console.log(output);
      throw AlbRequestHandler.#execError;
    }

    code = output.statusCode;

    const { statusDescription } = output;
    if (typeof statusDescription == "string") {
      const descComponents = statusDescription.split(" ");
      if (isNaN(descComponents[0] as unknown as number)) {
        log.RED("statusDescription must start with a statusCode number followed by a space + status description text");
        log.YELLOW("example: '200 Found'");
      } else {
        const desc = descComponents.slice(1).join(" ");
        if (desc.length) {
          statusMessage = desc;
        }
      }
    }

    if (this.mockEvent.multiValueHeaders) {
      if (output.multiValueHeaders) {
        const headersKeys = Object.keys(output.multiValueHeaders).filter((key) => key !== "Server" && key !== "Date");
        headersKeys.forEach((key) => {
          if (Array.isArray(output.multiValueHeaders[key])) {
            customHeaders.push([key, output.multiValueHeaders[key]]);
          } else {
            log.RED(`multiValueHeaders (${key}) values must be an array`);
            log.YELLOW("example:");
            log.GREEN(`'${key}': ['some/value']`);
            throw AlbRequestHandler.#execError;
          }
        });
      } else if (output.headers) {
        log.YELLOW("An ALB Lambda with 'multiValueHeaders enabled' must return 'multiValueHeaders' instead of 'headers'");
      }
    } else {
      if (typeof output.headers == "object" && !Array.isArray(output.headers)) {
        const headersKeys = Object.keys(output.headers).filter((key) => key !== "Server" && key !== "Date");

        headersKeys.forEach((key) => {
          const valueType = typeof output.headers[key];
          if (valueType == "string") {
            customHeaders.push([key, output.headers[key]]);
          } else {
            log.RED(`response headers (${key}) value must be typeof string.\nReceived: '${valueType}'`);
            throw new Error();
          }
        });
      } else if (output.multiValueHeaders) {
        log.YELLOW("Skipping 'multiValueHeaders' as it is not enabled for you target group in serverless.yml");
      }
    }

    const bodyType = typeof output.body;
    if (bodyType != "undefined" && bodyType != "string") {
      log.RED(`response 'body' must be a string. Receievd ${bodyType}`);
      throw AlbRequestHandler.#execError;
    }

    let resContent = output.body;

    if (resContent && output.isBase64Encoded) {
      const tmpContent = Buffer.from(resContent, "base64").toString();
      const reDecoded = Buffer.from(tmpContent).toString("base64");

      if (reDecoded != resContent) {
        log.RED("response body is not properly base64 encoded");
        throw AlbRequestHandler.#execError;
      } else {
        resContent = tmpContent;
      }
    }
    const contentTypeIndex = customHeaders.findIndex((x) => x[0].toLowerCase() == "content-type");
    if (contentTypeIndex == -1) {
      headers.push(["Content-Type", AlbRequestHandler.contentType.octet]);
    } else {
      headers.push(["Content-Type", customHeaders[contentTypeIndex][1]]);
      customHeaders.splice(contentTypeIndex, 1);
    }

    const contentLengthIndex = customHeaders.findIndex((x) => x[0].toLowerCase() == "content-length");
    const contentLengh = resContent ? String(Buffer.from(resContent).byteLength) : "0";
    if (contentLengthIndex != -1) {
      customHeaders.splice(contentLengthIndex, 1);
    }
    headers.push(["Content-Length", contentLengh], AlbRequestHandler.keepAlive, ...customHeaders);
    this.res.shouldKeepAlive = false;
    if (statusMessage) {
      this.res.writeHead(code, statusMessage, headers);
    } else {
      this.res.writeHead(code, headers);
    }

    this.res.end(resContent);
  };

  static #generatePayload({
    req,
    mockEvent,
    multiValueHeaders,
    isBase64Encoded,
    body,
    lambdaName,
  }: {
    req: IncomingMessage;
    mockEvent: LambdaEndpoint;
    multiValueHeaders: { [key: string]: string[] };
    isBase64Encoded: boolean;
    body: any;
    lambdaName: string;
  }) {
    const { method, headers, url } = req;

    const parsedURL = new URL(url as string, AlbRequestHandler.dummyHost);
    parsedURL.searchParams.delete("x_mock_type");

    let event: AlbPayload = {
      requestContext: {
        elb: {
          targetGroupArn: `arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/${lambdaName}-tg/49e9d65c45c6791a`,
        },
      },
      httpMethod: method as string,
      path: parsedURL.pathname,
      isBase64Encoded: body ? isBase64Encoded : false,
      body: body ?? "",
    };

    if (mockEvent.multiValueHeaders) {
      event.multiValueHeaders = {
        "x-forwarded-for": [String(req.socket.remoteAddress)],
        "x-forwarded-proto": ["http"],
        "x-forwarded-port": [String(CommonEventGenerator.port)],
        ...multiValueHeaders,
      };

      event.multiValueQueryStringParameters = CommonEventGenerator.getMultiValueQueryStringParameters(parsedURL.searchParams);
    } else {
      event.headers = {
        "x-forwarded-for": req.socket.remoteAddress,
        "x-forwarded-proto": "http",
        "x-forwarded-port": String(CommonEventGenerator.port),
        ...headers,
      };
      event.queryStringParameters = AlbRequestHandler.#paramsToAlbObject(url as string);

      if (event.headers["x-mock-type"]) {
        delete event.headers["x-mock-type"];
      }
    }
    return event;
  }
  static #paramsToAlbObject(reqUrl: string) {
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
}
