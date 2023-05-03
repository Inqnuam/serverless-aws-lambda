import type { IncomingMessage, ServerResponse } from "http";
import type { LambdaEndpoint } from "../../lib/parseEvents/endpoints";
import { BufferedStreamResponse } from "../../lib/runtime/bufferedStreamResponse";
import { randomUUID } from "crypto";

import { headerTooLarge, badRequest } from "./htmlStatusMsg";

export enum InvokationType {
  DryRun = 204,
  Event = 202,
  RequestResponse = 200,
}
export enum errorType {
  invalidRequest = "InvalidRequestContentException",
  notFound = "ResourceNotFoundException",
}

const supportedMethods = ["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH"];
const apgNullMsg = JSON.stringify({ Message: null });

export const parseClientContext = (contextAsBase64?: string) => {
  if (!contextAsBase64) {
    return;
  }

  try {
    const decoded = Buffer.from(contextAsBase64 as string, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded);
    return parsed;
  } catch (error) {
    return new Error(errorType.invalidRequest);
  }
};

export const unsupportedMethod = (res: ServerResponse, method: string) => {
  if (!supportedMethods.includes(method)) {
    res.statusCode = 403;
    res.setHeader("Content-Type", "application/json");
    res.end(apgNullMsg);
    return true;
  }
};

export const collectBody = async (req: IncomingMessage, isBase64?: boolean) => {
  let buf: Buffer | undefined = undefined;
  req.on("data", (chunk) => {
    buf = typeof buf === "undefined" ? chunk : Buffer.concat([buf, chunk]);
  });

  const body: string | undefined = await new Promise((resolve) => {
    req.on("end", async () => {
      resolve(buf ? buf.toString(isBase64 ? "base64" : "utf-8") : undefined);
    });
  });
  return body;
};

export const parseBody = (collecteBody: any) => {
  let body;
  try {
    body = JSON.parse(collecteBody);
  } catch (error: any) {
    if (body && body.length) {
      body = error;
    } else {
      body = {};
    }
  }
  return body;
};

export const isStreamResponse = (result: any) => {
  return result instanceof BufferedStreamResponse;
};
export const chunkToJs = (chunk: Uint8Array) => {
  let data;
  let rawData = Buffer.from(chunk).toString();
  try {
    data = JSON.parse(rawData);
  } catch (error) {
    data = rawData;
  }

  return data;
};
export const setRequestId = (res: ServerResponse) => {
  const awsRequestId = randomUUID();

  res.setHeader("x-amzn-RequestId", awsRequestId);
  return awsRequestId;
};

export const invalidPayloadErrorMsg = (msg: string) => {
  return JSON.stringify({
    Type: "User",
    message: `Could not parse request body into json: Could not parse payload into json: ${msg}: was expecting (JSON String, Number, Array, Object or token 'null', 'true' or 'false')`,
  });
};

export const base64ErorMsg = JSON.stringify({ Type: null, message: "Client context must be a valid Base64-encoded JSON object." });
export const notFound = (lambdaName: string) => {
  return JSON.stringify({
    Type: "User",
    message: `Function not found: arn:aws:lambda:region:000000000000:function:${lambdaName}`,
  });
};

export const internalServerError = (res: ServerResponse) => {
  if (!res.writableFinished) {
    res.statusCode = 502;
    if (!res.headersSent) {
      res.setHeader("Content-Type", "application/json");
    }

    res.end("Internal Server Error");
  }
};

export const isDelimiter = (chunk: Buffer) => {
  return chunk.byteLength == 8 && Array.from(chunk.values()).every((x) => x === 0);
};

export const getMultiValueHeaders = (rawHeaders: string[]) => {
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

const headerError = new Error(headerTooLarge);

const maxHeaderSize = {
  alb: 65536,
  apg: 10240,
  url: 10240,
};

const singleAlbHeaderSize = 16376;

export const checkHeaders = (headers: { [key: string]: any }, kind: LambdaEndpoint["kind"]) => {
  if (!headers.host) {
    throw new Error(badRequest);
  }
  let total = 0;
  const maximumAllowedSize = maxHeaderSize[kind];
  const entries = Object.entries(headers);

  if (kind == "alb") {
    entries.forEach((entry) => {
      const [k, v] = entry;
      if (v == "x-mock-type") {
        return;
      }
      const headerLength = k.length + v.length;
      if (headerLength > singleAlbHeaderSize) {
        throw headerError;
      }

      total = total + headerLength;
    });
  } else {
    entries.forEach((entry) => {
      const [k, v] = entry;
      if (v == "x-mock-type") {
        return;
      }
      total = total + k.length + v.length;
    });
  }
  if (total > maximumAllowedSize) {
    throw headerError;
  }
};

export const capitalize = (word: string) => {
  const capitalized = word.charAt(0).toUpperCase() + word.slice(1);
  return capitalized;
};
