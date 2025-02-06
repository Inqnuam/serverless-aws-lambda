import type { IncomingMessage, ServerResponse } from "http";
import type { OfflineRequest } from "../../defineConfig";
import { Handlers } from "../../lib/server/handlers";
import { StreamEncoder } from "./streamEncoder";

import { base64ErorMsg, errorType, parseBody, parseClientContext, collectBody, notFound, invalidPayloadErrorMsg, setRequestId } from "./utils";
import type { ILambdaMock } from "../../lib/runtime/rapidApi";

export const createResponseStreamingInvokeHandler = (handlers: ILambdaMock[]): OfflineRequest => {
  return {
    filter: /^\/2021-11-15\/functions\//,

    callback: async function (req: IncomingMessage, res: ServerResponse) {
      const { url, headers } = req;
      const parsedURL = new URL(url as string, "http://localhost:3003");

      const awsRequestId = setRequestId(res);
      const requestedName = Handlers.parseNameFromUrl(parsedURL.pathname);
      const foundHandler = handlers.find((x) => x.name == requestedName || x.outName == requestedName);

      const collectedBody = await collectBody(req);
      const body: any = parseBody(collectedBody);

      res.setHeader("X-Amzn-Trace-Id", `root=1-xxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx;sampled=0`);

      if (body instanceof Error) {
        res.statusCode = 400;
        res.setHeader("x-amzn-errortype", errorType.invalidRequest);

        return res.end(invalidPayloadErrorMsg(body.message));
      }

      const clientContext = parseClientContext(headers["x-amz-client-context"] as string);

      if (clientContext instanceof Error) {
        res.setHeader("x-amzn-errortype", errorType.invalidRequest);
        res.statusCode = 400;
        return res.end(base64ErorMsg);
      }

      const codec = new StreamEncoder(res);
      if (foundHandler) {
        const info: any = foundHandler.url?.stream ?? {};

        try {
          //@ts-ignore
          const response = await foundHandler.invoke(body, info, clientContext, codec);

          if (response) {
            codec.endWithJson(response);
          }
        } catch (error: any) {
          if (!res.writableFinished) {
            codec.endWithError(error);
          }
        }
      } else {
        res.statusCode = 404;
        res.end(notFound(requestedName));
      }
    },
  };
};
