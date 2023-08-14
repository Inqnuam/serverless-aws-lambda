import type { StreamableHandler } from "./streamResponse";
import type { IHttpResponseStream } from "./streamResponse";
import { HttpResponseStream } from "./streamResponse";

type HandlerMetadata = {
  highWaterMark?: number;
};

export interface awslambda {
  streamifyResponse: (handler: StreamableHandler, options?: HandlerMetadata) => Function;
  HttpResponseStream: IHttpResponseStream;
}

export const awslambda: awslambda = {
  streamifyResponse: function streamifyResponse(handler, options) {
    // @ts-ignore
    handler.stream = true;
    // @ts-ignore
    handler.streamOpt = options;
    return handler;
  },
  HttpResponseStream: HttpResponseStream,
};
