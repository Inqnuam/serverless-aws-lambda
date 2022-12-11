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
  headers: { [key: string]: any };
  isBase64Encoded: boolean;
  query: { [key: string]: string };
  body: any;
  method: HttpMethod;
  get: (headerField: string) => { [key: string]: any } | undefined;
  params: string[];
  protocol: string;
  secure: boolean;
}

export const _buildUniversalEvent = (awsAlbEvent: any) => {
  let uE = { ...awsAlbEvent };
  try {
    delete uE.cookies;
    uE.method = awsAlbEvent.httpMethod;
    uE.query = {};

    for (const [key, value] of Object.entries(awsAlbEvent.queryStringParameters)) {
      uE.query[key] = decodeURIComponent(value as string);
    }

    uE.get = (headerField: string) => {
      // TODO: check for both Referrer and Referer
      return awsAlbEvent.headers[headerField.toLowerCase()];
    };
    uE.path = uE.path ?? uE.rawPath;

    if (uE.requestContext) {
      if (!uE.method) {
        uE.method = uE.requestContext.http?.method;
      }

      if (!uE.path) {
        uE.path = uE.requestContext.http?.path;
      }
    }
    let reqPath = decodeURIComponent(uE.path);

    uE.params = reqPath.split("/").filter((x) => x);
    uE.protocol = awsAlbEvent.headers["x-forwarded-proto"];
    uE.secure = uE.protocol == "https";
    if (!awsAlbEvent.isBase64Encoded && awsAlbEvent.headers["content-type"] == "application/json") {
      const body = JSON.parse(awsAlbEvent.body);
      uE.body = body;
    }
  } catch (err) {}
  return uE;
};
