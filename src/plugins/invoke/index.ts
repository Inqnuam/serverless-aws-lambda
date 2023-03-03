import type { IncomingMessage, ServerResponse } from "http";
import { randomUUID } from "crypto";
import { log } from "../../lib/utils/colorize";
import { Handlers } from "../../lib/server/handlers";
enum InvokationType {
  DryRun = 204,
  Event = 202,
  RequestResponse = 200,
}
enum errprType {
  invalidRequest = "InvalidRequestContentException",
  notFound = "ResourceNotFoundException",
}
const parseClientContext = (contextAsBase64?: string) => {
  if (!contextAsBase64) {
    return;
  }

  try {
    const decoded = Buffer.from(contextAsBase64 as string, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded);
    return parsed;
  } catch (error) {
    return new Error(errprType.invalidRequest);
  }
};

const base64ErorMsg = JSON.stringify({ Type: null, message: "Client context must be a valid Base64-encoded JSON object." });
const invalidPayloadErrorMsg = (msg: string) => {
  return JSON.stringify({
    Type: "User",
    message: `Could not parse request body into json: Could not parse payload into json: ${msg}: was expecting (JSON String, Number, Array, Object or token 'null', 'true' or 'false')`,
  });
};

const notFound = (lambdaName: string) => {
  return JSON.stringify({
    Type: "User",
    message: `Function not found: arn:aws:lambda:region:000000000000:function:${lambdaName}`,
  });
};

export const invokeRequests = {
  filter: /(^\/2015-03-31\/functions\/)|(^\/@invoke\/)/,
  callback: async function (req: IncomingMessage, res: ServerResponse) {
    const { url, method, headers } = req;
    const parsedURL = new URL(url as string, "http://localhost:3003");

    const requestedName = Handlers.parseNameFromUrl(parsedURL.pathname);
    const foundHandler = Handlers.handlers.find((x) => x.name == requestedName || x.outName == requestedName);
    const awsRequestId = randomUUID();
    res.setHeader("Content-Type", "application/json");
    res.setHeader("x-amzn-RequestId", awsRequestId);

    if (!foundHandler) {
      res.statusCode = 404;
      res.setHeader("x-amzn-errortype", errprType.notFound);
      return res.end(notFound(requestedName));
    }

    const invokeType = headers["x-amz-invocation-type"];
    const clientContext = parseClientContext(headers["x-amz-client-context"] as string);

    if (clientContext instanceof Error) {
      res.setHeader("x-amzn-errortype", errprType.invalidRequest);
      res.statusCode = 400;
      return res.end(base64ErorMsg);
    }

    const exceptedStatusCode = invokeType == "DryRun" ? InvokationType.DryRun : invokeType == "Event" ? InvokationType.Event : InvokationType.RequestResponse;
    let event = "";
    let body: any = Buffer.alloc(0);

    req
      .on("data", (chunk) => {
        body += chunk;
      })
      .on("end", async () => {
        body = body.toString();

        let isParsedBody: any = false;
        try {
          body = JSON.parse(body);
          isParsedBody = true;
        } catch (error: any) {
          if (body && body.length) {
            isParsedBody = error;
          } else {
            body = {};
            isParsedBody = true;
          }
        }
        event = body;

        res.setHeader("X-Amzn-Trace-Id", `root=1-xxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx;sampled=0`);

        if (isParsedBody instanceof Error) {
          res.statusCode = 400;
          res.setHeader("x-amzn-errortype", errprType.invalidRequest);

          return res.end(invalidPayloadErrorMsg(isParsedBody.message));
        }

        res.setHeader("X-Amz-Executed-Version", "$LATEST");
        try {
          const date = new Date();

          let info: any = {};
          res.statusCode = exceptedStatusCode;
          if (exceptedStatusCode !== 200) {
            res.end();
          }
          // "Event" invokation type is an async invoke
          if (exceptedStatusCode == 202) {
            info.kind = "async";
          }
          log.CYAN(`${date.toLocaleDateString()} ${date.toLocaleTimeString()} requestId: ${awsRequestId} | '${foundHandler.name}' ${method}`);
          const result = await foundHandler.invoke(event, info, clientContext);

          if (exceptedStatusCode == 200) {
            res.end(JSON.stringify(result));
          }
        } catch (error: any) {
          res.setHeader("X-Amz-Function-Error", error.errorType);
          res.statusCode = 200;
          res.end(JSON.stringify(error));
        }
      })
      .on("error", (err) => {
        res.statusCode = 502;
        res.end(JSON.stringify(err));
      });
  },
};
