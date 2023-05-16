import { randomUUID } from "crypto";
import { log } from "../utils/colorize";
import { callErrorDest, callSuccessDest } from "./callDestinations";
import type { ServerResponse } from "http";
import type { ISnsEvent } from "../parseEvents/sns";
import type { IS3Event } from "../parseEvents/s3";
import type { ISqs } from "../parseEvents/sqs";
import type { IDdbEvent } from "../parseEvents/ddbStream";
import type { IDestination } from "../parseEvents/index";
import type { LambdaEndpoint } from "../parseEvents/endpoints";
import type { IKinesisEvent } from "../parseEvents/kinesis";
import type { IDocumentDbEvent } from "../parseEvents/documentDb";
import type { Runner } from "./runners/index";

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
  runtime: string;
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
  runner: Runner;
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
export class LambdaMock implements ILambdaMock {
  name: string;
  outName: string;
  online: boolean | string | string[];
  endpoints: LambdaEndpoint[];
  runtime: string;
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

  #_tmLifetime?: NodeJS.Timeout;
  runner: Runner;
  static ENABLE_TIMEOUT = true;
  constructor({
    name,
    outName,
    online,
    endpoints,
    runtime,
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
    runner,
  }: ILambdaMock & { runner: Runner }) {
    this.name = name;
    this.outName = outName;
    this.online = online;
    this.endpoints = endpoints;
    this.runtime = runtime;
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
    this.runner = runner;
  }

  handleErrorDestination(event: any, info: any, error: any, awsRequestId: string) {
    this.runner.onComplete(awsRequestId);
    console.error(error);

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
    this.runner.onComplete(awsRequestId);
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

  async invoke(event: any, info?: any, clientContext?: any, response?: ServerResponse) {
    if (!this.runner.isMounted) {
      log.BR_BLUE(`❄️ Cold start '${this.outName}'`);
      await this.runner.mount();
    }

    const awsRequestId = randomUUID();
    const hrTimeStart = this.#printStart(awsRequestId, event, info);
    this.invokeSub.forEach((x) => {
      try {
        x(event, info);
      } catch (error) {}
    });

    try {
      const eventResponse = await new Promise(async (resolve, reject) => {
        let tm: NodeJS.Timeout | undefined;
        if (LambdaMock.ENABLE_TIMEOUT) {
          tm = setTimeout(() => {
            response?.destroy();
            this.runner.onComplete(awsRequestId, true);
            log.RED(`'${this.outName}' | ${awsRequestId}: Request failed`);
            reject({
              errorType: "Unhandled",
              errorMessage: `${new Date().toISOString()} ${awsRequestId} Task timed out after ${this.timeout} seconds`,
            });
          }, this.timeout * 1000);
        }

        try {
          const res = await this.runner.invoke({ event, awsRequestId, info, clientContext, response });
          resolve(res);
        } catch (error) {
          reject(error);
        } finally {
          clearTimeout(tm);
        }
      });
      this.handleSuccessDestination(event, info, eventResponse, awsRequestId);
      return eventResponse;
    } catch (error) {
      this.handleErrorDestination(event, info, error, awsRequestId);
      throw error;
    } finally {
      this.#setLifetime();
      LambdaMock.#printExecTime(hrTimeStart, this.name);
    }
  }

  clear = () => {
    clearTimeout(this.#_tmLifetime);
    this.runner.unmount();
  };
  #setLifetime = () => {
    clearTimeout(this.#_tmLifetime);
    this.#_tmLifetime = setTimeout(() => {
      this.runner.unmount(true);
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
