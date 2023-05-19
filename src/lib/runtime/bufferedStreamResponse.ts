import { CommonEventGenerator } from "../../plugins/lambda/events/common";
import type { LambdaEndpoint } from "../parseEvents/endpoints";
import { log } from "../utils/colorize";

const httpIntegrationCt = "application/vnd.awslambda.http-integration-response";

export class BufferedStreamResponse {
  buffer?: Uint8Array;
  _isHttpIntegrationResponse: boolean;
  _metaDelimiter: number;
  _endDelimiter: number;
  _ct?: any;
  _isStreamResponse = true;
  #mockEvent?: LambdaEndpoint;
  static codec = new TextDecoder();
  static splitMessage = (buffer?: Uint8Array, metaDelimiter?: number) => {
    if (!buffer) {
      return;
    }

    const bytes = Array.from(buffer.values());
    let foundIndex: number | null = null;

    if (metaDelimiter) {
      foundIndex = metaDelimiter;
    } else {
      for (let i = 0; i < bytes.length; i++) {
        const byte = bytes[i];
        if (byte === 0) {
          const nextSevenBytes = [bytes[i + 1], bytes[i + 2], bytes[i + 3], bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]];
          if (nextSevenBytes.every((x) => x === 0)) {
            foundIndex = i;
            break;
          }
        }
      }
    }

    if (foundIndex) {
      return new Uint8Array(bytes.slice(0, foundIndex));
    }
  };
  constructor(mockEvent?: LambdaEndpoint) {
    this._isHttpIntegrationResponse = false;
    this._metaDelimiter = 0;
    this._endDelimiter = 0;
    this.#mockEvent = mockEvent;
  }
  setHeader(name: string, value: string) {
    this._isHttpIntegrationResponse = !this.buffer && value == httpIntegrationCt && (!this._ct || this._ct == httpIntegrationCt);
    this._ct = value;
  }
  write(chunk: Uint8Array, encoding?: BufferEncoding) {
    if (!this._isHttpIntegrationResponse && !this._metaDelimiter) {
      this._metaDelimiter = chunk.byteLength;
    }
    this.#collectChunk(chunk);
  }
  end(chunk?: Uint8Array) {
    if (this.buffer) {
      this._endDelimiter = this.buffer.byteLength;
    }
    if (chunk) {
      this.#collectChunk(chunk);
    }
  }
  destroy() {}

  #collectChunk(chunk: Uint8Array) {
    this.buffer = typeof this.buffer == "undefined" ? chunk : Buffer.concat([this.buffer, chunk]);
  }
  getParsedResponse() {
    if (!this.#mockEvent) {
      return;
    }
    const kind = this.#mockEvent.kind;
    if (kind == "alb") {
      const response = this.#getAlbResponse();
      return response;
    } else if (kind == "url") {
      const response = this.#getFunctionUrlResponse();
      return response;
    } else if (kind == "apg") {
      const response = this.#getApgResponse();
      return response;
    }
  }
  #getAlbResponse() {
    const responseBody = this._isHttpIntegrationResponse ? BufferedStreamResponse.splitMessage(this.buffer) : this.buffer;
    let responseData;
    if (responseBody) {
      responseData = this.#parseResponseData(responseBody);
    }
    return responseData;
  }
  #getApgResponse() {
    if (this._isHttpIntegrationResponse) {
      log.RED("awslambda.HttpResponseStream.from() is not supported with API Gateway");

      return {
        statusCode: 500,
        headers: {
          "Content-Type": CommonEventGenerator.contentType.json,
        },
        body: CommonEventGenerator.httpErrMsg,
      };
    } else if (this.buffer) {
      const responseData = this.#parseResponseData(this.buffer);

      return responseData;
    }
  }
  #getFunctionUrlResponse() {
    const responseBody = BufferedStreamResponse.splitMessage(this.buffer, this._isHttpIntegrationResponse ? undefined : this._metaDelimiter);
    let responseData;
    if (responseBody) {
      responseData = this.#parseResponseData(responseBody);
    }

    return responseData;
  }

  #parseResponseData(responseData: any) {
    let data = BufferedStreamResponse.codec.decode(responseData);

    if (typeof data == "string") {
      try {
        data = JSON.parse(data);
      } catch (error) {}
    }
    return data;
  }
}
