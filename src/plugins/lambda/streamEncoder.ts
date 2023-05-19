import type { ServerResponse } from "http";
import { EventStreamCodec } from "@aws-sdk/eventstream-codec";

import type { MessageHeaders } from "@aws-sdk/eventstream-codec";
import { CommonEventGenerator } from "./events/common";

interface ErrorMessage {
  errorType: string;
  errorMessage: string;
  trace: string[];
}

const fromUtf8 = (input: string, encoding?: BufferEncoding) => {
  const buf = Buffer.from(input, encoding);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength / Uint8Array.BYTES_PER_ELEMENT);
};
const toUtf8 = (input: Uint8Array) => Buffer.from(input, input.byteOffset, input.byteLength).toString("utf8");

const codec = new EventStreamCodec(toUtf8, fromUtf8);

export class StreamEncoder {
  res: ServerResponse;
  static complete = Buffer.from([
    0, 0, 0, 102, 0, 0, 0, 84, 31, 86, 200, 105, 11, 58, 101, 118, 101, 110, 116, 45, 116, 121, 112, 101, 7, 0, 14, 73, 110, 118, 111, 107, 101, 67, 111, 109, 112, 108, 101, 116,
    101, 13, 58, 99, 111, 110, 116, 101, 110, 116, 45, 116, 121, 112, 101, 7, 0, 16, 97, 112, 112, 108, 105, 99, 97, 116, 105, 111, 110, 47, 106, 115, 111, 110, 13, 58, 109, 101,
    115, 115, 97, 103, 101, 45, 116, 121, 112, 101, 7, 0, 5, 101, 118, 101, 110, 116, 123, 125, 112, 6, 212, 103,
  ]);
  constructor(res: ServerResponse) {
    this.res = res;
  }

  write(chunk: any, encoding: BufferEncoding, cb?: (error: Error | null | undefined) => void) {
    this.res.write(
      codec.encode({
        headers: this.#getStreamHeaders("PayloadChunk", CommonEventGenerator.contentType.octet),
        body: chunk,
      }),
      encoding,
      cb
    );
  }
  end(chunk?: Uint8Array) {
    if (chunk) {
      this.write(chunk, "utf8", () => {
        this.res.end(StreamEncoder.complete);
      });
    } else {
      this.res.end(StreamEncoder.complete);
    }
  }
  setHeader(key: string, value: string) {
    // Currently only Content-Type is supported by AWS
    if (key == "Content-Type") {
      this.res.setHeader("Content-Type", value);
    }
  }

  destroy() {
    this.res.destroy();
  }

  endWithError(payload: ErrorMessage) {
    const errorResponse = {
      ErrorCode: payload.errorType,
      ErrorDetails: JSON.stringify(payload),
    };
    const body = Array.from(Buffer.from(JSON.stringify(errorResponse)).values());

    this.res.end(
      codec.encode({
        headers: this.#getStreamHeaders("InvokeComplete", CommonEventGenerator.contentType.json),
        body: new Uint8Array(body),
      })
    );
  }
  endWithJson(payload: any) {
    const body = Array.from(Buffer.from(JSON.stringify(payload)).values());

    this.res.write(
      codec.encode({
        headers: this.#getStreamHeaders("PayloadChunk", CommonEventGenerator.contentType.octet),
        body: new Uint8Array(body),
      }),
      () => {
        this.res.end(StreamEncoder.complete);
      }
    );
  }
  #getStreamHeaders(eventType: string, contentType: string, messageType: string = "event"): MessageHeaders {
    return {
      ":event-type": { type: "string", value: eventType },
      ":content-type": { type: "string", value: contentType },
      ":message-type": { type: "string", value: messageType },
    };
  }
}
