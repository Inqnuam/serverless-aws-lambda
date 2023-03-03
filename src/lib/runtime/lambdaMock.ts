import { Worker, WorkerOptions } from "worker_threads";
import path from "path";
import { HttpMethod } from "../server/handlers";
import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import { log } from "../utils/colorize";
import { callErrorDest, callSuccessDest } from "./callDestinations";

export interface IS3Event {
  bucket: string;
  type: [string, string];
  rules: any[];
}

export interface ISnsEvent {
  name: string;
  arn?: string;
  topicName?: string;
  displayName?: string;
  filterScope?: "MessageAttributes" | "MessageBody";
  filter?: any;
  redrivePolicy?: {
    kind: string;
    name: string;
  };
}
export interface IDdbEvent {
  TableName: string;
  StreamEnabled: boolean;
  StreamViewType?: string;
  batchSize?: number;
  functionResponseType?: string;
  filterPatterns?: any;
  onFailure?: IDestination;
}
export interface IDestination {
  kind: "lambda" | "sns" | "sqs";
  name: string;
}

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
  online: boolean;
  /**
   * API Gateway and Application Load balancer events.
   */
  endpoints: LambdaEndpoint[];
  s3: IS3Event[];
  sns: ISnsEvent[];
  ddb: IDdbEvent[];
  kinesis: any[];
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

  esOutputPath: string;
  entryPoint: string;
  invokeSub: InvokeSub[];
  /**
   * Invoke this lambda
   * always use with "await"
   */
  invoke: (event: any, info?: any, clientContext?: any) => Promise<any>;
  onError?: IDestination;
  onSuccess?: IDestination;
  onFailure?: IDestination;
}

type InvokeSub = (event: any, info?: any) => void;

/**
 * @internal
 */
export interface LambdaEndpoint {
  kind: "alb" | "apg";
  paths: string[];
  methods: HttpMethod[];
  async?: boolean;
  multiValueHeaders?: boolean;
  version?: 1 | 2;
}
/**
 * @internal
 */

const workerPath = path.resolve(__dirname, "./lib/runtime/worker.js");
// https://aws.amazon.com/blogs/architecture/understanding-the-different-ways-to-invoke-lambda-functions/
const asyncEvents = ["async", "ddb", "kinesis", "s3", "sns", "sqs"];

const isAsync = (info: any) => {
  if (typeof info?.kind == "string") {
    return asyncEvents.includes(info.kind) || info.async;
  }

  return false;
};

export class LambdaMock extends EventEmitter implements ILambdaMock {
  name: string;
  outName: string;
  online: boolean;
  endpoints: LambdaEndpoint[];
  s3: IS3Event[];
  sns: ISnsEvent[];
  ddb: IDdbEvent[];
  kinesis: any[];
  timeout: number;
  memorySize: number;
  environment: { [key: string]: any };
  handlerPath: string;
  handlerName: string;
  esEntryPoint: string;
  esOutputPath: string;
  entryPoint: string;
  invokeSub: InvokeSub[];
  onError?: IDestination;
  onSuccess?: IDestination;
  onFailure?: IDestination;
  _worker?: Worker;
  _isLoaded: boolean = false;
  _isLoading: boolean = false;
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
    ddb,
    kinesis,
    invokeSub,
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
    this.ddb = ddb;
    this.kinesis = kinesis;
    this.timeout = timeout;
    this.memorySize = memorySize;
    this.environment = environment;
    this.handlerPath = handlerPath;
    this.handlerName = handlerName;
    this.esEntryPoint = esEntryPoint;
    this.esOutputPath = esOutputPath;
    this.entryPoint = entryPoint;
    this.invokeSub = invokeSub;
    this.onError = onError;
    this.onSuccess = onSuccess;
    this.onFailure = onFailure;
  }

  async importEventHandler() {
    await new Promise((resolve, reject) => {
      this._worker = new Worker(workerPath, {
        env: this.environment,
        stackSizeMb: this.memorySize,
        workerData: {
          name: this.name,
          timeout: this.timeout,
          memorySize: this.memorySize,
          esOutputPath: this.esOutputPath,
          handlerName: this.handlerName,
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
        const { channel, data, awsRequestId } = e;
        if (channel == "import") {
          this._worker!.setMaxListeners(55);
          this.setMaxListeners(10);
          this._worker!.removeListener("error", errorHandler);
          this._isLoaded = true;
          this._isLoading = false;
          this.emit("loaded", true);
          resolve(undefined);
        } else {
          this.emit(awsRequestId, channel, data);
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

    if (!isAsync(info)) {
      return;
    }

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

  handleSuccessDestination(event: any, info: any, response: any, awsRequestId: string) {
    if (!this.onSuccess || !isAsync(info)) {
      return;
    }

    callSuccessDest({
      destination: this.onSuccess,
      LOCAL_PORT: this.environment.LOCAL_PORT,
      event,
      payload: response,
      requestId: awsRequestId,
      lambdaName: this.outName,
    });
  }
  async invoke(event: any, info?: any, clientContext?: any) {
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

    try {
      this.invokeSub.forEach((x) => x(event, info));
    } catch (error) {}

    const eventResponse = await new Promise((resolve, reject) => {
      const awsRequestId = randomUUID();

      this._worker!.postMessage({
        channel: "exec",
        data: { event, clientContext },
        awsRequestId,
      });

      this.once(awsRequestId, (channel: string, data: any) => {
        switch (channel) {
          case "return":
          case "succeed":
          case "done":
            this.handleSuccessDestination(event, info, data, awsRequestId);
            resolve(data);
            break;
          case "fail":
            this.handleErrorDestination(event, info, data, awsRequestId);
            reject(data);
            break;
          default:
            reject(new Error("Unknown error"));
            break;
        }
      });
    });

    return eventResponse;
  }
}
