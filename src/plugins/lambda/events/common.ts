import type { IncomingMessage, IncomingHttpHeaders } from "http";
import type { LambdaEndpoint } from "../../../lib/parseEvents/endpoints";

export type normalizedSearchParams = { toString: () => string } & { [key: string]: string[] | undefined };

export class CommonEventGenerator {
  static apiId: string = "";
  static accountId: string = "";
  static port: number = 3000;
  static serve: any;
  static contentType = {
    json: "application/json",
    text: "text/plain; charset=utf-8",
    octet: "application/octet-stream",
  };
  static keepAlive = ["Connection", "keep-alive"];
  static dummyHost = "http://localhost:3003";
  static httpErrMsg = '{"message":"Internal Server Error"}';
  static apigJsonParseErrMsg = '{"message":"[Unknown error parsing request body]"}';
  static apigForbiddenErrMsg = '{"message":"Forbidden"}';
  static amzMsgNull = '{"message":null}';
  static apgTimeoutMsg = '{"message": "Endpoint request timed out"}';
  static unavailable = '{"message":"Service Unavailable"}';
  static timeoutRegex = /after.\d+.*seconds/;
  static apgRequestTimeout = 30;
  static getMultiValueHeaders = (rawHeaders: string[]) => {
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
  };

  static getIsBase64Encoded = (headers: IncomingHttpHeaders) => {
    const contentType = headers["content-type"];
    if (headers["content-encoding"] || !contentType) {
      return true;
    }

    if (
      contentType.startsWith("application/json") ||
      contentType.startsWith("application/xml") ||
      contentType.startsWith("application/javascript") ||
      contentType.startsWith("text/")
    ) {
      return false;
    }

    return true;
  };

  static getCustomHeaders(req: IncomingMessage, mockEvent: LambdaEndpoint) {
    const { headers } = req;
    delete headers["x-mock-type"];
    delete headers.connection;

    return { "X-Forwarded-For": req.socket.remoteAddress, "X-Forwarded-Proto": "http", "X-Forwarded-Port": String(CommonEventGenerator.port), ...headers };
  }
  static getPathParameters(mockEvent: LambdaEndpoint, parsedURL: URL) {
    const paramDeclarations = mockEvent.paths[0].split("/");
    const reqParams = parsedURL.pathname.split("/");
    let pathParameters: any = {};

    paramDeclarations.forEach((k, i) => {
      if (k.startsWith("{") && k.endsWith("}") && !k.endsWith("+}")) {
        pathParameters[k.slice(1, -1)] = reqParams[i];
      }
    });
    return pathParameters;
  }
  static normalizeSearchParams = (searchParams: URLSearchParams, rawUrl: string) => {
    let query: normalizedSearchParams = {};

    Array.from(searchParams.keys()).forEach((x) => {
      const values = searchParams.getAll(x).map((v) => v.toLowerCase());
      const key = x.toLowerCase();

      if (values) {
        if (query[key]) {
          query[key]!.push(...values);
        } else {
          query[key] = values;
        }
      } else if (!query[key]) {
        query[key] = undefined;
      }
    });

    let rawSearchParams = "";

    // url may include multiple '?' so we avoid .split()
    const foundIndex = rawUrl.indexOf("?");
    if (foundIndex != -1) {
      rawSearchParams = rawUrl.slice(foundIndex + 1);
    }

    query.toString = () => rawSearchParams;

    return query;
  };

  static getMultiValueQueryStringParameters = (searchParams: URLSearchParams) => {
    let multiValueQueryStringParameters: any = {};

    searchParams.delete("x_mock_type");

    for (const k of Array.from(new Set(searchParams.keys()))) {
      multiValueQueryStringParameters[k] = searchParams.getAll(k).map(encodeURI);
    }
    return multiValueQueryStringParameters;
  };
  static isEndpointTimeoutError = (errorMessage?: string) => {
    if (!errorMessage) {
      return;
    }
    const secondsStr = errorMessage.match(this.timeoutRegex)?.[0];
    if (secondsStr) {
      const sec = secondsStr.split(" ")[1];
      if (!isNaN(sec as unknown as number)) {
        return Number(sec) >= CommonEventGenerator.apgRequestTimeout;
      }
    }
  };
}
