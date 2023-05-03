import { Worker, WorkerOptions } from "worker_threads";
import path from "path";
import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import { log } from "../utils/colorize";
import { callErrorDest, callSuccessDest } from "./callDestinations";
import { BufferedStreamResponse } from "./bufferedStreamResponse";
import type { ServerResponse } from "http";
import type { ISnsEvent } from "../parseEvents/sns";
import type { IS3Event } from "../parseEvents/s3";
import type { ISqs } from "../parseEvents/sqs";
import type { IDdbEvent } from "../parseEvents/ddbStream";
import type { IDestination } from "../parseEvents/index";
import type { LambdaEndpoint } from "../parseEvents/endpoints";
import type { IKinesisEvent } from "../parseEvents/kinesis";
import type { IDocumentDbEvent } from "../parseEvents/documentDb";

type InvokeSub = (event: any, info?: any) => void;
type InvokeSuccessSub = (input: any, output: any, info?: any) => void;
type InvokeErrorSub = InvokeSuccessSub;
export interface ILambdaMock {
  /**
   * Function name declared in serverless.yml.
   */
  name: string;
  /**
   * Function name which will be published as in AWS.
   */
  outName: string;
  /**
   * Deploy Lambda or not to AWS.
   */
  online: boolean | string | string[];
  /**
   * API Gateway and Application Load balancer events.
   */
  endpoints: LambdaEndpoint[];
  s3: IS3Event[];
  sns: ISnsEvent[];
  ddb: IDdbEvent[];
  sqs: ISqs[];
  kinesis: IKinesisEvent[];
  documentDb: IDocumentDbEvent[];
  url?: LambdaEndpoint;
  timeout: number;
  memorySize: number;
  environment: { [key: string]: any };
  /**
   * function handler as declared in serverless.yml.
   */
  handlerPath: string;
  /**
   * exported function name
   */
  handlerName: string;
  /**
   * esbuild entry point absolute path.
   */
  esEntryPoint: string;
  /**
   * bundle absolute path.
   */
  esOutputPath: string;
  /**
   * resolved entry point.
   */
  entryPoint: string;
  invokeSub: InvokeSub[];
  invokeSuccessSub: InvokeSuccessSub[];
  invokeErrorSub: InvokeErrorSub[];
  /**
   * Invoke this lambda.
   *
   * must always be called with "await" or ".then()"
   * @returns {Promise}
   * @throws Error
   */
  invoke: (event: any, info?: any, clientContext?: any) => Promise<any>;
  onError?: IDestination;
  onSuccess?: IDestination;
  onFailure?: IDestination;
}

const runtimeLifetime = 18 * 60 * 1000;
// https://aws.amazon.com/blogs/architecture/understanding-the-different-ways-to-invoke-lambda-functions/
const asyncEvents = new Set(["async", "ddb", "kinesis", "s3", "sns", "sqs"]);

const isAsync = (info: any) => {
  if (typeof info?.kind == "string") {
    return asyncEvents.has(info.kind) || info.async;
  }

  return false;
};
export class LambdaMock extends EventEmitter implements ILambdaMock {
  name: string;
  outName: string;
  online: boolean | string | string[];
  endpoints: LambdaEndpoint[];
  s3: IS3Event[];
  sns: ISnsEvent[];
  sqs: ISqs[];
  ddb: IDdbEvent[];
  kinesis: IKinesisEvent[];
  documentDb: IDocumentDbEvent[];
  url?: LambdaEndpoint;
  timeout: number;
  memorySize: number;
  environment: { [key: string]: any };
  handlerPath: string;
  handlerName: string;
  esEntryPoint: string;
  esOutputPath: string;
  entryPoint: string;
  onError?: IDestination;
  onSuccess?: IDestination;
  onFailure?: IDestination;
  invokeSub: InvokeSub[];
  invokeSuccessSub: InvokeSuccessSub[];
  invokeErrorSub: InvokeErrorSub[];
  _worker?: Worker;
  _isLoaded: boolean = false;
  _isLoading: boolean = false;
  #_tmLifetime?: NodeJS.Timeout;
  #workerPath: string;
  constructor({
    name,
    outName,
    online,
    endpoints,
    timeout,
    memorySize,
    environment,
    handlerPath,
    handlerName,
    esEntryPoint,
    esOutputPath,
    entryPoint,
    s3,
    sns,
    sqs,
    ddb,
    kinesis,
    url,
    documentDb,
    invokeSub,
    invokeSuccessSub,
    invokeErrorSub,
    onError,
    onSuccess,
    onFailure,
  }: ILambdaMock) {
    super();
    this.name = name;
    this.outName = outName;
    this.online = online;
    this.endpoints = endpoints;
    this.s3 = s3;
    this.sns = sns;
    this.sqs = sqs;
    this.ddb = ddb;
    this.kinesis = kinesis;
    this.url = url;
    this.documentDb = documentDb;
    this.timeout = timeout;
    this.memorySize = memorySize;
    this.environment = environment;
    this.handlerPath = handlerPath;
    this.handlerName = handlerName;
    this.esEntryPoint = esEntryPoint;
    this.esOutputPath = esOutputPath;
    this.entryPoint = entryPoint;
    this.invokeSub = invokeSub;
    this.invokeSuccessSub = invokeSuccessSub;
    this.invokeErrorSub = invokeErrorSub;
    this.onError = onError;
    this.onSuccess = onSuccess;
    this.onFailure = onFailure;
    this.#workerPath = path.resolve(__dirname, "./lib/runtime/runners/node.js");
  }

  async importEventHandler() {
    await new Promise((resolve, reject) => {
      this._worker = new Worker(this.#workerPath, {
        env: this.environment,
        execArgv: ["--enable-source-maps"],
        workerData: {
          name: this.name,
          timeout: this.timeout,
          memorySize: this.memorySize,
          esOutputPath: this.esOutputPath,
          handlerName: this.handlerName,
          debug: log.getDebug(),
        },
      } as WorkerOptions);

      this._worker.setMaxListeners(0);

      const errorHandler = (err: any) => {
        this._isLoaded = false;
        this._isLoading = false;
        log.RED("Lambda execution fatal error");
        console.error(err);
        this.emit("loaded", false);
        reject(err);
      };

      this._worker.on("message", (e) => {
        const { channel, data, awsRequestId, type, encoding } = e;
        if (channel == "import") {
          this._worker!.setMaxListeners(55);
          this.setMaxListeners(10);
          this._worker!.removeListener("error", errorHandler);
          this._isLoaded = true;
          this._isLoading = false;
          this.emit("loaded", true);
          resolve(undefined);
        } else {
          this.emit(awsRequestId, channel, data, type, encoding);
        }
      });
      this._worker.on("error", errorHandler);
      this._worker.postMessage({ channel: "import" });
    });
  }
  handleErrorDestination(event: any, info: any, error: any, awsRequestId: string) {
    if (!this.onError || !this.onFailure) {
      console.error(error);
    }

    this.invokeErrorSub.forEach((x) => {
      try {
        x(event, error, info);
      } catch (error) {}
    });

    if (isAsync(info)) {
      const errParams = {
        LOCAL_PORT: this.environment.LOCAL_PORT,
        event,
        payload: error,
        requestId: awsRequestId,
        lambdaName: this.outName,
      };
      if (this.onError) {
        callErrorDest({ ...errParams, destination: this.onError });
      }

      if (this.onFailure) {
        callErrorDest({ ...errParams, destination: this.onFailure });
      }
    }
  }

  handleSuccessDestination(event: any, info: any, response: any, awsRequestId: string) {
    if (this.onSuccess && isAsync(info)) {
      callSuccessDest({
        destination: this.onSuccess,
        LOCAL_PORT: this.environment.LOCAL_PORT,
        event,
        payload: response,
        requestId: awsRequestId,
        lambdaName: this.outName,
      });
    }

    this.invokeSuccessSub.forEach((x) => {
      try {
        x(event, response, info);
      } catch (error) {}
    });
  }

  async #load() {
    if (this._isLoading) {
      this.setMaxListeners(0);
      await new Promise((resolve, reject) => {
        this.once("loaded", (isLoaded) => {
          if (isLoaded) {
            resolve(undefined);
          } else {
            reject();
          }
        });
      });
    } else if (!this._isLoaded) {
      this._isLoading = true;
      log.BR_BLUE(`❄️ Cold start '${this.outName}'`);
      await this.importEventHandler();
    }
  }
  async invoke(event: any, info?: any, clientContext?: any, response?: ServerResponse) {
    await this.#load();
    const awsRequestId = randomUUID();
    const hrTimeStart = this.#printStart(awsRequestId, event, info);
    this.invokeSub.forEach((x) => {
      try {
        x(event, info);
      } catch (error) {}
    });

    try {
      const eventResponse = await new Promise((resolve, reject) => {
        this._worker!.postMessage({
          channel: "exec",
          data: { event, clientContext },
          awsRequestId,
        });
        const res = response ?? new BufferedStreamResponse(info);

        function listener(this: LambdaMock, channel: string, data: any, type: string, encoding: BufferEncoding) {
          switch (channel) {
            case "return":
            case "succeed":
            case "done":
              this.handleSuccessDestination(event, info, data, awsRequestId);
              this.removeListener(awsRequestId, listener);
              resolve(data);
              break;
            case "fail":
              this.handleErrorDestination(event, info, data, awsRequestId);
              this.removeListener(awsRequestId, listener);
              reject(data);
              break;
            case "stream":
              if (type == "write") {
                res.write(data, encoding);
              } else if (type == "ct") {
                res.setHeader("Content-Type", data);
              } else if (type == "timeout") {
                this.handleErrorDestination(event, info, data, awsRequestId);
                this.removeListener(awsRequestId, listener);
                res.destroy();
                reject(data);
              } else {
                this.handleSuccessDestination(event, info, data, awsRequestId);
                this.removeListener(awsRequestId, listener);
                res.end(data);
                resolve(res instanceof BufferedStreamResponse ? res : undefined);
              }
              break;
            default:
              this.removeListener(awsRequestId, listener);
              this.clear();
              reject(new Error("Unknown error"));
              break;
          }
        }
        this.on(awsRequestId, listener);
      });
      return eventResponse;
    } catch (error) {
      throw error;
    } finally {
      this.#setLifetime();
      LambdaMock.#printExecTime(hrTimeStart, this.name);
    }
  }

  clear = () => {
    clearTimeout(this.#_tmLifetime);
    this._worker?.terminate();
  };
  #setLifetime = () => {
    clearTimeout(this.#_tmLifetime);
    this.#_tmLifetime = setTimeout(() => {
      if (this._worker) {
        this._worker.terminate();
        this._isLoaded = false;
        this._isLoading = false;
      }
    }, runtimeLifetime);
  };
  #printStart = (awsRequestId: string, event: any, info?: any) => {
    const method = event?.httpMethod ?? event?.method ?? "";
    let reqPath = event?.path ?? event?.rawPath ?? "";

    if (reqPath) {
      reqPath = decodeURI(reqPath);
    }
    const suffix = `${method} ${reqPath}`;
    const date = new Date();

    log.CYAN(`${date.toLocaleDateString()} ${date.toLocaleTimeString()} requestId: ${awsRequestId} | '${this.name}' ${suffix}`);
    log.GREY(this.entryPoint);
    let kind = "";
    if (typeof info?.kind == "string") {
      kind = ` (${info.kind.toUpperCase()})`;
    }
    log.YELLOW(`input payload${kind}`);
    log.info(event);
    return process.hrtime();
  };
  static #printExecTime = (hrTimeStart: [number, number], lambdaName: string) => {
    const endAt = process.hrtime(hrTimeStart);
    const execTime = `${endAt[0]},${endAt[1]}s`;
    const executedTime = `⌛️ '${lambdaName}' execution time: ${execTime}`;
    // as main and worker process share the same stdout we need a timeout before printing any additionnal info
    setTimeout(() => {
      log.YELLOW(executedTime);
    }, 400);
  };
}

export type { ISnsEvent, IS3Event, ISqs, IDdbEvent, IDestination, LambdaEndpoint, IDocumentDbEvent, IKinesisEvent };
