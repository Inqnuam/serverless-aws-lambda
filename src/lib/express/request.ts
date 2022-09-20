import { cookie, CookieOptions } from "../cookies";
import { HttpMethod } from "../router";

export interface RawResponseContent {
  cookies: string[];
  isBase64Encoded: boolean;
  statusCode: number;
  headers: { [key: string]: any };
  body: string | null | undefined;
}

export interface IRequest {
  requestContext: { [key: string]: any };
  httpMethod: HttpMethod;
  queryStringParameters: { [key: string]: string };
  path: string;
  headers: { [key: string]: any };
  isBase64Encoded: boolean;
  query: { [key: string]: string };
  body: string | null | undefined;
  method: HttpMethod;
  cookies: { [key: string]: any };
  get: (headerField: string) => { [key: string]: any } | undefined;
  params: string[];
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
    universalEvent.cookies = typeof awsAlbEvent.headers.cookie == "string" ? cookie.parse(awsAlbEvent.headers.cookie) : {};
    universalEvent.get = (headerField: string) => {
      // TODO: check for both Referrer and Referer
      return awsAlbEvent.headers[headerField.toLowerCase()];
    };
    let reqPath = decodeURIComponent(universalEvent.path);

    // const queryStartPos = reqPath.lastIndexOf("?");
    // if (queryStartPos != -1) {
    //   reqPath = reqPath.slice(0, queryStartPos);
    // }

    universalEvent.params = reqPath.split("/").filter((x) => x);
  } catch (err) {}

  return universalEvent;
};
