import type { IncomingMessage, ServerResponse } from "http";
import type { LambdaEndpoint } from "../../../lib/parseEvents/endpoints";
import { CommonEventGenerator } from "./common";
import { log } from "../../../lib/utils/colorize";
import { randomUUID } from "crypto";

interface CommonApgEvent {
  body?: string;
  queryStringParameters: { [key: string]: string };
  isBase64Encoded: boolean;
  headers: { [key: string]: any };
  pathParameters?: { [key: string]: any };
}

export type ApgHttpApiEvent = {
  version: string;
  routeKey: string;
  rawPath: string;
  rawQueryString: string;
  cookies?: string[];
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
} & CommonApgEvent;

export type ApgHttpEvent = {
  version?: string;
  resource: string;
  path: string;
  httpMethod: string;
  multiValueHeaders: { [key: string]: any };
  multiValueQueryStringParameters: { [key: string]: any };
  requestContext: {
    accountId: string;
    apiId: string;
    domainName: string;
    domainPrefix: string;
    extendedRequestId: string;
    httpMethod: string;
    path: string;
    protocol: string;
    requestId: string;
    requestTime: string;
    requestTimeEpoch: number;
    resourcePath: string;
    stage: string;
  };
} & CommonApgEvent;

export class ApgRequestHandler extends CommonEventGenerator {
  res: ServerResponse;
  mockEvent: LambdaEndpoint;
  payload: ApgHttpApiEvent | ApgHttpEvent;
  constructor({
    res,
    req,
    body,
    mockEvent,
    multiValueHeaders,
    isBase64Encoded,
    lambdaName,
    parsedURL,
    requestId,
  }: {
    res: ServerResponse;
    req: IncomingMessage;
    body: any;
    mockEvent: LambdaEndpoint;
    multiValueHeaders: any;
    isBase64Encoded: boolean;
    lambdaName: string;
    parsedURL: URL;
    requestId: string;
  }) {
    super();
    this.res = res;
    this.mockEvent = mockEvent;
    this.payload =
      mockEvent.version == 1
        ? ApgRequestHandler.createApgV1Event({ req, mockEvent, parsedURL, lambdaName, multiValueHeaders, isBase64Encoded, requestId, body })
        : ApgRequestHandler.createApgV2Event({ req, mockEvent, parsedURL, requestId, isBase64Encoded, body });
  }

  static skipHeaders: string[] = ["connection", "content"];
  static createApgV2Event = ({
    req,
    mockEvent,
    parsedURL,
    requestId,
    isBase64Encoded,
    body,
  }: {
    req: IncomingMessage;
    mockEvent: LambdaEndpoint;
    isBase64Encoded: boolean;
    parsedURL: URL;
    body: any;
    requestId: string;
  }): ApgHttpApiEvent => {
    const { method, headers } = req;
    const pathParameters: any = ApgRequestHandler.getPathParameters(mockEvent, parsedURL);

    let event: any;
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

    const routeKey = mockEvent.paths[0] == "/*" ? "$default" : `${customMethod} ${parsedURL.pathname}`;
    const date = new Date();
    const defaultIp = "127.0.0.1";
    const sourceIp = headers.host?.startsWith("localhost") ? defaultIp : headers.host ? headers.host.split(":")[0] : defaultIp;
    const apgEvent: Partial<ApgHttpApiEvent> = {
      version: "2.0",
      routeKey,
      rawPath: parsedURL.pathname,
      rawQueryString,
      headers: ApgRequestHandler.getCustomHeaders(req, mockEvent),

      requestContext: {
        accountId: String(ApgRequestHandler.accountId),
        apiId: ApgRequestHandler.apiId,
        domainName: `localhost:${ApgRequestHandler.port}`,
        domainPrefix: "localhost",
        http: {
          method: method as string,
          path: parsedURL.pathname,
          protocol: "HTTP/1.1",
          sourceIp,
          userAgent: headers["user-agent"] ?? "",
        },
        requestId,
        routeKey,
        stage: "$default",
        time: date.toISOString(),
        timeEpoch: date.getTime(),
      },
    };
    if (body) {
      apgEvent.body = body;
      apgEvent.isBase64Encoded = isBase64Encoded;
    } else {
      apgEvent.isBase64Encoded = false;
    }

    if (Object.keys(queryStringParameters).length) {
      apgEvent.queryStringParameters = queryStringParameters;
    }

    if (Object.keys(pathParameters).length) {
      apgEvent.pathParameters = pathParameters;
    }
    if (headers.cookie) {
      apgEvent.cookies = headers.cookie.split("; ");
    }

    event = apgEvent;

    if (event.headers["x-mock-type"]) {
      delete event.headers["x-mock-type"];
    }
    return event;
  };

  static createApgV1Event = ({
    req,
    mockEvent,
    parsedURL,
    lambdaName,
    isBase64Encoded,
    requestId,
    body,
  }: {
    req: IncomingMessage;
    mockEvent: LambdaEndpoint;
    parsedURL: URL;
    lambdaName: string;
    isBase64Encoded: boolean;
    multiValueHeaders: { [key: string]: string[] };
    requestId: string;
    body: any;
  }): ApgHttpEvent => {
    const { method } = req;

    let event: any = {};
    if (mockEvent.proxy == "httpApi") {
      event.version = "1.0";
    }
    const resourcePath = mockEvent.paths[0];
    event.resource = resourcePath;
    event.path = parsedURL.pathname;
    event.httpMethod = method!;

    const { headers, multiValueHeaders, apiKey } = ApgRequestHandler.getApiGV1Headers(req, mockEvent);

    event.headers = headers;
    event.multiValueHeaders = multiValueHeaders;
    const sourceIp = String(req.socket.remoteAddress);

    const queryStringParameters: any = Object.fromEntries(parsedURL.searchParams);
    event.queryStringParameters = Object.keys(queryStringParameters).length ? queryStringParameters : null;

    const multiValueQueryStringParameters: any = ApgRequestHandler.getMultiValueQueryStringParameters(parsedURL.searchParams);
    event.multiValueQueryStringParameters = Object.keys(multiValueQueryStringParameters).length ? multiValueQueryStringParameters : null;
    const date = new Date();
    const requestContext: any = {
      accountId: String(ApgRequestHandler.accountId),
      apiId: ApgRequestHandler.apiId,
      domainName: `localhost:${ApgRequestHandler.port}`,
      domainPrefix: "localhost",
      extendedRequestId: "fake-id",
      httpMethod: method!,
      identity: {
        accessKey: null,
        accountId: null,
        caller: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: sourceIp,
        user: null,
        userAgent: req.headers["user-agent"],
        userArn: null,
      },
      path: parsedURL.pathname,
      protocol: "HTTP/1.1",
      requestId,
      requestTime: date.toISOString(),
      requestTimeEpoch: date.getTime(),
      resourceId: "exhmtv",
      resourcePath,
    };
    if (mockEvent.proxy == "httpApi") {
      requestContext.identity.cognitoAmr = null;
      requestContext.stage = "$default";
    } else {
      requestContext.stage = "dev";
      if (mockEvent.private) {
        requestContext.identity.apiKey = apiKey;
        requestContext.identity.apiKeyId = "abcdefghjk";
      }
    }
    event.requestContext = requestContext;

    const pathParameters: any = ApgRequestHandler.getPathParameters(mockEvent, parsedURL);
    event.pathParameters = Object.keys(pathParameters).length ? pathParameters : null;
    event.stageVariables = null;

    event.body = body ?? null;
    event.isBase64Encoded = body ? isBase64Encoded : false;

    return event;
  };
  returnError = (err?: any) => {
    if (this.res.writableFinished) {
      return true;
    }

    let code = 500;
    let body = ApgRequestHandler.httpErrMsg;

    if (err && ApgRequestHandler.isEndpointTimeoutError(err.errorMessage)) {
      if (this.mockEvent.proxy == "httpApi") {
        code = 503;
        body = ApgRequestHandler.unavailable;
      } else {
        code = 504;
        body = ApgRequestHandler.apgTimeoutMsg;
      }
    }
    const headers = [
      ["Date", new Date().toUTCString()],
      ["Content-Type", ApgRequestHandler.contentType.json],
      ["Content-Length", String(body.length)],
      ApgRequestHandler.keepAlive,
      ["Apigw-Requestid", "ETuSEj-PiGYEJdQ="],
    ];
    this.res.shouldKeepAlive = false;
    this.res.writeHead(code, headers);

    return this.res.end(body);
  };

  #normalizeV1Value = (v: any) => {
    let value: string | null = "";
    const vType = typeof v;

    if (vType == "string" || vType == "number" || vType == "boolean") {
      value = String(v);
    } else if (v === null) {
      value = "";
    } else {
      throw new Error("");
    }

    return value;
  };
  sendV1Response = (output?: any) => {
    const headers = [["Date", new Date().toUTCString()], ["Apigw-Requestid", Buffer.from(randomUUID()).toString("base64").slice(0, 16)], ApgRequestHandler.keepAlive];
    let code = 200;

    if (!output || isNaN(output.statusCode)) {
      log.RED("Valid 'http' response payload must be an object which includes a valid 'statusCode'.\nReceived:");
      console.log(output);

      throw new Error();
    }
    code = output.statusCode;

    if (output.headers && typeof output.headers == "object" && !Array.isArray(output.headers)) {
      Object.entries(output.headers).forEach(([k, v]) => {
        const key = ApgRequestHandler.normalizeHeaderKey(k);
        const value = this.#normalizeV1Value(v);

        headers.push([key, value]);
      });
    }

    if (output.multiValueHeaders && typeof output.multiValueHeaders == "object" && !Array.isArray(output.multiValueHeaders)) {
      Object.entries(output.multiValueHeaders).forEach(([k, v]) => {
        const key = ApgRequestHandler.normalizeHeaderKey(k);

        if (!Array.isArray(v)) {
          throw new Error();
        }
        const values = v.map((x) => this.#normalizeV1Value(x));

        values.forEach((nw) => {
          headers.push([key, nw]);
        });
      });
    }

    let resContent = output.body;

    if (output.isBase64Encoded && resContent) {
      if (typeof resContent != "string") {
        throw new Error();
      }
      const tmpContent = Buffer.from(resContent, "base64").toString();
      const reDecoded = Buffer.from(tmpContent).toString("base64");

      if (reDecoded != resContent) {
        log.RED("response body is not properly base64 encoded");
        throw new Error();
      } else {
        resContent = tmpContent;
      }
    }

    const contentTypeIndex = headers.findIndex((x) => x[0].toLowerCase() == "content-type");

    if (contentTypeIndex == -1 && resContent) {
      headers.push(["Content-Type", ApgRequestHandler.contentType.json]);
    }

    const contentLengthIndex = headers.findIndex((x) => x[0].toLowerCase() == "content-length");
    if (contentLengthIndex != -1) {
      headers.splice(contentLengthIndex, 1);
    }

    const contentType = typeof resContent;
    if (contentType == "number" || contentType == "boolean") {
      resContent = String(resContent);
    } else if (resContent && contentType != "string") {
      log.YELLOW("API Gateway payload v1 return body must be typeof string, number or boolean ");
    }

    const contentLengh = resContent ? String(Buffer.from(resContent).byteLength) : "0";
    headers.push(["Content-Length", contentLengh]);

    this.res.shouldKeepAlive = false;
    this.res.writeHead(code, headers);
    this.res.end(resContent);
  };
  sendV2Response = (output?: any) => {
    this.res.setHeader("Apigw-Requestid", Buffer.from(randomUUID()).toString("base64").slice(0, 16));
    this.res.setHeader("Date", new Date().toUTCString());

    if (output) {
      if (typeof output.headers == "object" && !Array.isArray(output.headers)) {
        const headersKeys = Object.keys(output.headers).filter((key) => key !== "Apigw-Requestid" && key !== "Date");
        headersKeys.forEach((key) => {
          this.res.setHeader(key, output.headers[key]);
        });
      }

      if (!output.statusCode) {
        this.res.statusCode = 200;
      } else {
        this.res.statusCode = output.statusCode;

        if (output.cookies?.length) {
          this.res.setHeader("Set-Cookie", output.cookies);
          // log.RED(`'cookies' as return value is supported only in API Gateway HTTP API (httpApi) payload v2.\nUse 'Set-Cookie' header instead`);
        }
      }
    } else {
      this.res.statusCode = 200;
    }

    let resContent = "";
    if (!output) {
      return this.res.end();
    }

    if (typeof output == "object" && typeof output.body == "string") {
      resContent = output.body;

      if (output.isBase64Encoded) {
        const tmpContent = Buffer.from(resContent, "base64").toString();
        const reDecoded = Buffer.from(tmpContent).toString("base64");

        if (reDecoded != resContent) {
          log.RED("response body is not properly base64 encoded");
          throw new Error();
        } else {
          resContent = tmpContent;
        }
      }
    }
    if (typeof output == "string") {
      this.res.setHeader("Content-Type", ApgRequestHandler.contentType.json);
      resContent = output;
    } else if (typeof output == "object" && !output.statusCode) {
      this.res.setHeader("Content-Type", ApgRequestHandler.contentType.json);
      resContent = JSON.stringify(output);
    }

    this.res.end(resContent);
  };
  sendResponse = (output?: any) => {
    if (this.res.writableFinished) {
      return;
    }
    if (this.mockEvent.version == 1) {
      return this.sendV1Response(output);
    }
    return this.sendV2Response(output);
  };
}
