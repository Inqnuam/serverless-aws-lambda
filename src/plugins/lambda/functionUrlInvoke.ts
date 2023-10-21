import type { OfflineRequest } from "../../defineConfig";
import type { ServerResponse } from "http";
import { ApgRequestHandler } from "./events/apg";
import { amazonifyHeaders } from "../../lib/utils/amazonifyHeaders";
import { chunkToJs, setRequestId, isDelimiter, collectBody, internalServerError, isStreamResponse, unsupportedMethod } from "./utils";
import { BufferedStreamResponse } from "../../lib/runtime/bufferedStreamResponse";
import { Handlers } from "../../lib/server/handlers";
import { CommonEventGenerator } from "./events/common";

const createStreamResponseHandler = (res: ServerResponse, foundHandler: any) => {
  const serverRes = foundHandler.url.stream ? res : undefined;

  if (serverRes) {
    let isHttpIntegrationResponse = false;
    const originalWrite = res.write.bind(res);
    const originalSetHeader = res.setHeader.bind(res);
    let contentType: any;
    let collectedChunks: any = undefined;

    const collectChunks = (chunk: Uint8Array) => {
      collectedChunks = collectedChunks ? Buffer.concat([collectedChunks, chunk]) : chunk;
    };

    const sendHeaders = () => {
      if (collectedChunks) {
        let data = chunkToJs(collectedChunks);

        const code = data.statusCode ?? 200;
        try {
          const headers = amazonifyHeaders(data.headers, data.cookies);
          res.writeHead(code, headers);
        } catch (error: any) {
          res.writeHead(500, error.headers);
          res.end?.(CommonEventGenerator.amzMsgNull);
          delete error.headers;
        }
      } else {
        res.writeHead(200);
      }
    };
    serverRes.setHeader = (name: string, value: number | string | ReadonlyArray<string>) => {
      if (name.toLowerCase() == "content-type") {
        if (value == "application/vnd.awslambda.http-integration-response") {
          isHttpIntegrationResponse = true;
          return originalSetHeader("Content-Type", CommonEventGenerator.contentType.json);
        } else {
          contentType = value;
        }
      }

      return originalSetHeader(name, value);
    };

    let sendHeadersBefore = false;
    // @ts-ignore
    serverRes.write = (chunk: any, encoding: BufferEncoding, cb?: (error: Error | null | undefined) => void) => {
      if (serverRes.headersSent) {
        return originalWrite(chunk, encoding, cb);
      } else if (sendHeadersBefore) {
        try {
          const chunkString = BufferedStreamResponse.codec.decode(chunk);

          const out = JSON.parse(chunkString);
          if (Array.isArray(out)) {
            throw new Error("Invalid stream response");
          }

          if (out && typeof out == "object") {
            sendHeaders();
            return originalWrite(chunk, encoding, cb);
          }

          res.writeHead(200, { "Content-Type": CommonEventGenerator.contentType.octet });
          return res.end();
        } catch (error: any) {
          const err = new Error(
            `When using HttpResponseStream first chunk of .write() must be valid JSON and not be Array. Number and null will respones with 200.\n'${foundHandler.name}'`
          );
          err.cause = error.message;
          console.error(err);
          return internalServerError(res);
        }
      } else {
        // first bytes to be written to body
        if (isHttpIntegrationResponse) {
          if (isDelimiter(chunk)) {
            sendHeadersBefore = true;
          } else {
            collectChunks(chunk);
          }
        } else {
          if (contentType == CommonEventGenerator.contentType.json) {
            // AMZ checks if the first write() is parsable
            try {
              const chunkString = BufferedStreamResponse.codec.decode(chunk);
              const parsed = JSON.parse(chunkString);
              if (parsed === null || typeof parsed == "number") {
                throw new Error(chunkString);
              }
            } catch (error: any) {
              const err = new Error(`When 'Content-Type' is 'application/json' first chunk of .write() must be parsable JSON and not be null or number.\n'${foundHandler.name}'`);
              err.cause = error.message;
              console.error(err);
              return internalServerError(res);
            }
          }
          const headers = { "Content-Type": contentType ?? CommonEventGenerator.contentType.octet };
          serverRes.writeHead(200, headers);
          return originalWrite(chunk, encoding, cb);
        }
      }
    };

    return serverRes;
  }
};

const handleInvokeResponse = (result: any, res: ServerResponse, invokeResponseStream: any) => {
  const streamifyResponse = isStreamResponse(result);
  let response = streamifyResponse ? result.getParsedResponse() : result;

  let finalResponse;
  let toBase64 = false;
  if (response && typeof response == "object" && response.statusCode) {
    const invalidCode = isNaN(response.statusCode);
    const code = invalidCode ? 500 : response.statusCode;
    toBase64 = !invalidCode && (response.isBase64Encoded == true || response.isBase64Encoded == "true");

    if (response.headers || response.cookies) {
      try {
        const headers = amazonifyHeaders(response.headers, response.cookies);

        res.writeHead(code, headers);
      } catch (error: any) {
        res.writeHead(500, error.headers);
        delete error.headers;
        console.error(error);
        return res.end(CommonEventGenerator.amzMsgNull);
      }
    } else {
      res.writeHead(code, { "Content-Type": CommonEventGenerator.contentType.json });
    }

    if (!invokeResponseStream) {
      if (typeof response.body != "undefined") {
        finalResponse = response.body;
      }
      if (!res.headersSent) {
        res.setHeader("Content-Type", streamifyResponse ? CommonEventGenerator.contentType.octet : CommonEventGenerator.contentType.json);
      }
    } else {
      finalResponse = response;
    }
  } else {
    res.writeHead(200, { "Content-Type": CommonEventGenerator.contentType.json });
    finalResponse = response;
  }

  if (!res.headersSent && !invokeResponseStream && streamifyResponse) {
    res.setHeader("Content-Type", CommonEventGenerator.contentType.octet);
  }

  if (invokeResponseStream) {
    if (finalResponse instanceof Uint8Array) {
      res.end(finalResponse);
    } else {
      res.end(JSON.stringify(finalResponse));
    }
  } else {
    if (typeof finalResponse == "number" || typeof finalResponse == "boolean" || finalResponse == null || finalResponse instanceof Object) {
      finalResponse = JSON.stringify(finalResponse);
    }

    if (finalResponse && toBase64) {
      finalResponse = Buffer.from(finalResponse, "base64");
    }
    res.end(finalResponse);
  }
};

export const functionUrlInvoke: OfflineRequest = {
  filter: /^\/@url\//,
  callback: async function (req, res) {
    const { url, method, headers } = req;
    if (unsupportedMethod(res, method!)) {
      return;
    }
    const parsedURL = new URL(url as string, CommonEventGenerator.dummyHost);

    const requestId = setRequestId(res);
    const requestedName = Handlers.parseNameFromUrl(parsedURL.pathname);
    const foundHandler = Handlers.handlers.find((x) => x.name == requestedName || x.outName == requestedName);

    if (!foundHandler?.url) {
      res.statusCode = 404;
      return res.end("Not Found");
    }
    const isBase64Encoded = CommonEventGenerator.getIsBase64Encoded(headers);

    const body = await collectBody(req, isBase64Encoded);
    const reqEvent = ApgRequestHandler.createApgV2Event({ req, mockEvent: foundHandler.url, parsedURL, requestId, body, isBase64Encoded });
    const fixedPath = parsedURL.pathname.replace(`/@url/${foundHandler.name}/`, "/").replace(`/@url/${foundHandler.outName}/`, "/");
    reqEvent.requestContext.accountId = "anonymous";
    reqEvent.rawPath = fixedPath;
    reqEvent.requestContext.http.path = fixedPath;

    try {
      const serverRes = createStreamResponseHandler(res, foundHandler);
      //@ts-ignore
      const result = await foundHandler.invoke(reqEvent, foundHandler.url, undefined, serverRes);

      if (!result) {
        return res.end();
      }
      handleInvokeResponse(result, res, serverRes);
    } catch (error) {
      console.error(error);
      internalServerError(res);
    }
  },
};
