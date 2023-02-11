import { Worker, WorkerOptions } from "worker_threads";
import { resolve as pathResolve } from "path";
import { HttpMethod } from "./handlers";
import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import { log } from "./colorize";
const workerPath = pathResolve(__dirname, "./lib/worker.cjs");

interface IS3Event {
  bucket: string;
  type: [string, string];
  rules: any[];
}
/**
 * @internal
 */
export interface ILambdaMock {
  name: string;
  outName: string;
  online: boolean;
  endpoints: LambdaEndpoint[];
  s3: IS3Event[];
  sns: any[];
  ddb: any[];
  timeout: number;
  memorySize: number;
  environment: { [key: string]: any };
  handlerPath: string;
  handlerName: string;
  esEntryPoint: string;
  esOutputPath: string;
  entryPoint: string;
  _worker?: Worker;
  invokeSub: ((event: any) => void)[];
  invoke: (event: any, info?: any) => Promise<any>;
}
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
export class LambdaMock extends EventEmitter implements ILambdaMock {
  name: string;
  outName: string;
  online: boolean;
  endpoints: LambdaEndpoint[];
  s3: any[];
  sns: any[];
  ddb: any[];
  timeout: number;
  memorySize: number;
  environment: { [key: string]: any };
  handlerPath: string;
  handlerName: string;
  esEntryPoint: string;
  esOutputPath: string;
  entryPoint: string;
  _worker?: Worker;
  invokeSub: ((event: any, info?: any) => void)[];
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
    invokeSub,
  }: ILambdaMock) {
    super();
    this.name = name;
    this.outName = outName;
    this.online = online;
    this.endpoints = endpoints;
    this.s3 = s3;
    this.sns = sns;
    this.ddb = ddb;
    this.timeout = timeout;
    this.memorySize = memorySize;
    this.environment = environment;
    this.handlerPath = handlerPath;
    this.handlerName = handlerName;
    this.esEntryPoint = esEntryPoint;
    this.esOutputPath = esOutputPath;
    this.entryPoint = entryPoint;
    this.invokeSub = invokeSub;
  }

  async importEventHandler() {
    const workerData = {
      name: this.name,
      timeout: this.timeout,
      memorySize: this.memorySize,
      esOutputPath: this.esOutputPath,
      handlerName: this.handlerName,
    };
    await new Promise((resolve, reject) => {
      this._worker = new Worker(workerPath, {
        env: this.environment,
        stackSizeMb: this.memorySize,
        workerData,
      } as WorkerOptions);

      this._worker.on("message", (e) => {
        const { channel, data, awsRequestId } = e;
        if (channel == "import") {
          resolve(undefined);
        } else {
          this.emit(awsRequestId, channel, data);
        }
      });
      this._worker.once("error", (err) => {
        log.RED("Lambda execution fatal error");
        console.error(err);

        reject(err);
      });
      this._worker.postMessage({ channel: "import" });
    });
  }

  async invoke(event: any, info?: any) {
    if (!this._worker) {
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
        data: { event },
        awsRequestId,
      });

      this._worker!.once("error", (err) => {
        this._worker!.removeAllListeners("error");
        reject(err);
      });
      this.on(awsRequestId, (channel, rawData) => {
        this.removeAllListeners(awsRequestId);
        this._worker!.removeAllListeners("error");

        let data;
        try {
          data = channel == "return" ? rawData : JSON.parse(rawData);
        } catch (error) {
          data = rawData;
        }
        switch (channel) {
          case "return":
          case "succeed":
          case "done":
            resolve(data);
            break;
          case "fail":
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
