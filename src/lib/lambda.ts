import { Worker, WorkerOptions } from "worker_threads";
import { resolve as pathResolve } from "path";
import { HttpMethod } from "./router";
import { randomUUID } from "crypto";
import { EventEmitter } from "events";

import { log } from "./colorize";
import { IncomingMessage, ServerResponse } from "http";
import { html500 } from "./htmlStatusMsg";
const workerPath = pathResolve(__dirname, "./worker.js");

/**
 * @internal
 */
export interface ILambdaMock {
  name: string;
  endpoints: LambdaEndpoint[];
  timeout: number;
  memorySize: number;
  environment: { [key: string]: any };
  handlerPath: string;
  handlerName: string;
  esEntryPoint: string;
  esOutputPath: string;
  entryPoint: string;
  _worker?: Worker;
  invoke: (event: any, res: ServerResponse, method: string, path: string) => Promise<any>;
}
/**
 * @internal
 */
export interface LambdaEndpoint {
  kind: "alb" | "apg";
  paths: string[];
  methods: HttpMethod[];
}
/**
 * @internal
 */
export class LambdaMock extends EventEmitter implements ILambdaMock {
  name: string;

  endpoints: LambdaEndpoint[];

  timeout: number;
  memorySize: number;
  environment: { [key: string]: any };
  handlerPath: string;
  handlerName: string;
  esEntryPoint: string;
  esOutputPath: string;
  entryPoint: string;
  _worker?: Worker;
  constructor({ name, endpoints, timeout, memorySize, environment, handlerPath, handlerName, esEntryPoint, esOutputPath, entryPoint }: ILambdaMock) {
    super();
    this.name = name;
    this.endpoints = endpoints;
    this.timeout = timeout;
    this.memorySize = memorySize;
    this.environment = environment;
    this.handlerPath = handlerPath;
    this.handlerName = handlerName;
    this.esEntryPoint = esEntryPoint;
    this.esOutputPath = esOutputPath;
    this.entryPoint = entryPoint;
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
      this._worker.on("error", (err) => {
        log.RED("Lambda execution fatal error");
        console.error(err);

        reject(err);
      });
      this._worker.postMessage({ channel: "import" });
    });
  }
  async invoke(event: any, res: any, method: string, path: string) {
    if (!this._worker) {
      log.BR_BLUE(`❄️ Cold start '${this.name}'`);
      await this.importEventHandler();
    }

    const eventResponse = await new Promise((resolve, reject) => {
      const awsRequestId = randomUUID();

      const date = new Date();
      log.CYAN(`${date.toLocaleDateString()} ${date.toLocaleTimeString()} requestId: ${awsRequestId} | '${this.name}' ${method} ${path}`);
      this._worker?.postMessage({
        channel: "exec",
        data: { event },
        awsRequestId,
      });

      this.on(awsRequestId, (channel, rawData) => {
        this.removeAllListeners(awsRequestId);

        let data;
        try {
          data = channel == "return" ? rawData : JSON.parse(rawData);
        } catch (error) {
          data = rawData;
        }
        switch (channel) {
          case "return":
            resolve(data);

            break;
          case "succeed":
            res.statusCode = data.statusCode;
            res.setHeader("Server", "awselb/2.0");
            res.setHeader("Date", new Date().toUTCString());
            if (data.headers && typeof data.headers == "object") {
              for (const [key, value] of Object.entries(data.headers)) {
                res.setHeader(key, value);
              }
            }

            res.end(data.body);
            resolve(undefined);
            break;
          case "fail":
            log.RED(data);

            res.statusCode = 502;
            res.setHeader("Content-Type", "text/html");
            res.setHeader("Server", "awselb/2.0");
            res.setHeader("Date", new Date().toUTCString());
            res.end(html500);

            resolve(undefined);
            break;
          case "done":
            res.statusCode = data.statusCode;
            res.setHeader("Server", "awselb/2.0");
            res.setHeader("Date", new Date().toUTCString());
            if (data.headers && typeof data.headers == "object") {
              for (const [key, value] of Object.entries(data.headers)) {
                res.setHeader(key, value);
              }
            }

            res.end(data.body);

            resolve(undefined);
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
