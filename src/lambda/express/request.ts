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
}

export const _buildUniversalEvent = (awsAlbEvent: any) => {
  let universalEvent = { ...awsAlbEvent };
  try {
    universalEvent.method = awsAlbEvent.httpMethod;
    universalEvent.query = {};

    for (const [key, value] of Object.entries(awsAlbEvent.queryStringParameters)) {
      universalEvent.query[key] = decodeURIComponent(value as string);
    }
    if (!awsAlbEvent.isBase64Encoded && awsAlbEvent.headers["content-type"] == "application/json") {
      const body = JSON.parse(awsAlbEvent.body);
      universalEvent.body = body;
    }

    universalEvent.get = (headerField: string) => {
      // TODO: check for both Referrer and Referer
      return awsAlbEvent.headers[headerField.toLowerCase()];
    };
    let reqPath = decodeURIComponent(universalEvent.path);

    universalEvent.params = reqPath.split("/").filter((x) => x);
    universalEvent.protocol = awsAlbEvent.headers["x-forwarded-proto"];
  } catch (err) {}

  return universalEvent;
};
