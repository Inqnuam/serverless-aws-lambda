import { Writable } from "stream";
import type { WritableOptions } from "stream";

type writeCb = (error: Error | null | undefined) => void;
// custom Writable interace to exclude AWS's undefined properties
// currently TS's Omit dont handle this special case
// also added hidden properites like 'writable' whichs actually works on AWS

interface IResponseStream {
  cork: Writable["cork"];
  /**
   * Do not use. This may lead to unexcepted result in AWS Lambda Runtime.
   * @deprecated
   */
  destroy: Writable["destroy"];
  end: Writable["end"];
  uncork: Writable["uncork"];
  write: Writable["write"];
  addListener: Writable["addListener"];
  emit: Writable["emit"];
  eventNames: Writable["eventNames"];
  getMaxListeners: Writable["getMaxListeners"];
  listenerCount: Writable["listenerCount"];
  listeners: Writable["listeners"];
  off: Writable["off"];
  on: Writable["on"];
  once: Writable["once"];
  prependListener: Writable["prependListener"];
  prependOnceListener: Writable["prependOnceListener"];
  rawListeners: Writable["rawListeners"];
  removeAllListeners: Writable["removeAllListeners"];
  removeListener: Writable["removeListener"];
  setMaxListeners: Writable["setMaxListeners"];
  /**
   * @param {any} contentType must be a string or implement toString()
   * @throws Error
   */
  setContentType: (contentType: any) => void;

  writable: boolean;
  readonly writableEnded: boolean;
  readonly writableFinished: boolean;
  readonly writableHighWaterMark: number;
  readonly writableLength: number;
  readonly writableObjectMode: boolean;
  readonly writableNeedDrain: boolean;
  readonly writableCorked: number;
  destroyed: boolean;
  /**
   * used by AWS inside HttpResponseStream.from function
   * @internal
   */
  _onBeforeFirstWrite?: (write: Writable["write"]) => any;
}

interface IStreamableHandlerContext {
  callbackwaitsforemptyeventloop: boolean;
  functionVersion: string;
  functionName: string;
  memoryLimitInMB: string;
  logGroupName: string;
  logStreamName: string;
  clientContext: any;
  identity: any;
  invokedFunctionArn: string;
  awsRequestId: string;
  getRemainingTimeInMillis: () => number;
}

export type StreamableHandler = (event: any, responseStream: IResponseStream, context?: IStreamableHandlerContext) => Promise<any | void>;

interface IMetadata {
  statusCode?: number;
  headers?: { [key: string]: string };
  cookies?: string[];
  body?: string | Buffer;
  isBase64Encoded?: boolean;
}

export class ResponseStream extends Writable {
  #isSent = false;
  #__write;
  #invalidContentType = new TypeError('Invalid value "undefined" for header "Content-Type"');
  _onBeforeFirstWrite?: (write: Writable["write"]) => any;
  constructor(opts: Partial<WritableOptions>) {
    super({ highWaterMark: opts.highWaterMark, write: opts.write });
    this.#__write = this.write.bind(this);

    // @ts-ignore
    this.write = (chunk: any, encoding?: BufferEncoding | writeCb, cb?: writeCb): boolean | undefined => {
      chunk = this.#wrapeChunk(chunk);

      if (!this.#isSent && typeof this._onBeforeFirstWrite == "function") {
        this._onBeforeFirstWrite((_chunk: any) => this.#__write(_chunk));
      }
      // @ts-ignore
      const writeResponse = this.#__write(chunk, encoding, cb);

      if (!this.#isSent) {
        this.#isSent = true;
      }
      return writeResponse;
    };

    const orgEnd = this.end.bind(this);

    // @ts-ignore
    this.end = (...params) => {
      if (params.length) {
        const [chunk] = params;
        if (chunk && typeof chunk != "function") {
          this.write(chunk);

          orgEnd();
        } else {
          // @ts-ignore
          orgEnd(...params);
        }
      } else {
        // @ts-ignore
        orgEnd(...params);
      }
    };
  }
  #wrapeChunk = (chunk: any) => {
    if (typeof chunk !== "string" && !Buffer.isBuffer(chunk) && chunk?.constructor !== Uint8Array) {
      chunk = JSON.stringify(chunk);
    }
    return chunk;
  };
  setContentType = (contentType: any) => {
    if (!contentType) {
      throw this.#invalidContentType;
    }
    this.emit("ct", contentType);
  };
}

export interface IHttpResponseStream {
  /**
   * @param {any} metadata http proxy integration response object.
   *
   * This could also be 'any' byte to be written before all write.() executions.
   *
   * Metadata will be wrapped into JSON.stringify().
   *
   *  `{statusCode: 404, cookies: ["hello=world"]}`
   *
   *
   * @throws Error
   */
  from: (responseStream: IResponseStream, metadata: IMetadata) => IResponseStream;
}

export class HttpResponseStream {
  public static from = (responseStream: IResponseStream, metadata: IMetadata) => {
    const data = JSON.stringify(metadata);

    responseStream._onBeforeFirstWrite = (write) => {
      responseStream.setContentType("application/vnd.awslambda.http-integration-response");
      write(data);
      // Delimiter for http integration response content (metadata) and .write() content
      write(new Uint8Array(8));
    };

    return responseStream;
  };
}
