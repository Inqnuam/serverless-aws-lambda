type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "ANY";

export interface RawAPIResponseContent {
  cookies?: string[];
  isBase64Encoded: boolean;
  statusCode: number;
  headers: { [key: string]: any };
  body: string | null | undefined;
}

export interface RawResponseContent {
  statusCode: number;
  [key: string]: any;
}

export interface IRequest {
  requestContext: { [key: string]: any };
  httpMethod: HttpMethod;
  queryStringParameters: { [key: string]: string };
  path: string;
  headers: any;
  isBase64Encoded: boolean;
  query: any;
  body: any;
  method: HttpMethod;
  get: (headerField: string) => { [key: string]: any } | undefined;
  params: string[];
  protocol: string;
  secure: boolean;
}

export const _buildUniversalEvent = (event: any) => {
  let uE = { ...event };
  try {
    delete uE.cookies;
    uE.method = event.httpMethod;
    uE.query = {};

    if (event.multiValueQueryStringParameters) {
      for (const [key, value] of Object.entries(event.multiValueQueryStringParameters)) {
        const parsedValue = (value as unknown as []).map(decodeURIComponent);

        if (parsedValue.length == 1) {
          uE.query[key] = parsedValue[0];
        } else {
          uE.query[key] = parsedValue;
        }
      }
    } else if (event.queryStringParameters) {
      for (const [key, value] of Object.entries(event.queryStringParameters)) {
        uE.query[key] = decodeURIComponent(value as string);
      }
    }

    let headers: any = {};

    if (event.multiValueHeaders) {
      for (const [key, value] of Object.entries(event.multiValueHeaders)) {
        const parsedValue = (value as unknown as []).map(decodeURIComponent);

        if (parsedValue.length == 1) {
          headers[key] = parsedValue[0];
        } else {
          headers[key] = parsedValue;
        }
      }
    } else if (event.headers) {
      for (const [key, value] of Object.entries(event.headers)) {
        headers[key] = decodeURIComponent(value as string);
      }
    }
    uE.headers = headers;
    uE.get = (headerField: string) => {
      // TODO: check for both Referrer and Referer
      return uE.headers[headerField.toLowerCase()];
    };
    uE.path = uE.path ?? uE.rawPath;

    if (uE.requestContext) {
      if (!uE.method) {
        uE.method = uE.requestContext?.http?.method;
      }

      if (!uE.path) {
        uE.path = uE.requestContext?.http?.path;
      }
    }
    let reqPath = uE.path ? decodeURIComponent(uE.path) : undefined;

    uE.params = reqPath?.split("/").filter((x) => x);
    uE.protocol = uE.headers["x-forwarded-proto"] ?? undefined;
    uE.secure = uE.protocol ? uE.protocol == "https" : undefined;
    if (!uE.isBase64Encoded && uE.headers["content-type"] == "application/json") {
      const body = JSON.parse(event.body);
      uE.body = body;
    }
  } catch (err) {
    console.log(err);
  }
  return uE;
};
