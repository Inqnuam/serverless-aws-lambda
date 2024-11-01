import type { Runner } from "../index";
import { EventEmitter } from "events";
import { Worker } from "worker_threads";
import type { WorkerOptions } from "worker_threads";
import path from "path";
import { log } from "../../../utils/colorize";
import { BufferedStreamResponse } from "../../bufferedStreamResponse";
import { fileURLToPath } from "url";
const moduleDirname = fileURLToPath(new URL(".", import.meta.url));

export class NodeRunner extends EventEmitter implements Runner {
  _worker?: Worker;
  isMounted: boolean = false;
  _isLoading: boolean = false;
  invoke: (request: any) => Promise<any>;
  mount: () => any;
  unmount: () => any;
  name: string;
  outName: string;
  timeout: number;
  memorySize: number;
  environment: { [key: string]: any };
  handlerPath: string;
  handlerName: string;
  esOutputPath: string;
  constructor({
    name,
    outName,
    timeout,
    memorySize,
    environment,
    handlerPath,
    handlerName,
    esOutputPath,
  }: {
    name: string;
    outName: string;
    handlerPath: string;
    handlerName: string;
    esOutputPath: string;
    timeout: number;
    memorySize: number;
    environment: { [key: string]: any };
  }) {
    super();
    this.name = name;
    this.outName = outName;
    this.timeout = timeout;
    this.memorySize = memorySize;
    this.environment = environment;
    this.handlerPath = handlerPath;
    this.handlerName = handlerName;
    this.esOutputPath = esOutputPath;
    this.mount = async () => {
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
      } else if (!this.isMounted) {
        this._isLoading = true;
        await this.importHandler();
      }
    };
    this.unmount = () => {
      this._worker?.terminate();
      this.isMounted = false;
      this._isLoading = false;
    };

    this.invoke = async ({ event, info, clientContext, response, awsRequestId }) => {
      return new Promise((resolve, reject) => {
        this._worker!.postMessage({
          channel: "exec",
          data: { event, clientContext },
          awsRequestId,
        });
        const res = response ?? new BufferedStreamResponse(info);

        function listener(this: NodeRunner, channel: string, data: any, type: string, encoding: BufferEncoding) {
          switch (channel) {
            case "return":
            case "succeed":
            case "done":
              this.removeListener(awsRequestId, listener);
              resolve(data);
              break;
            case "fail":
              this.removeListener(awsRequestId, listener);
              reject(data);
              break;
            case "stream":
              if (type == "write") {
                res.write(data, encoding);
              } else if (type == "ct") {
                res.setHeader("Content-Type", data);
              } else if (type == "timeout") {
                this.removeListener(awsRequestId, listener);
                res.destroy();
                reject(data);
              } else {
                this.removeListener(awsRequestId, listener);
                res.end(data);
                resolve(res instanceof BufferedStreamResponse ? res : undefined);
              }
              break;
            default:
              this.removeListener(awsRequestId, listener);

              reject(new Error("Unknown error"));
              break;
          }
        }
        this.on(awsRequestId, listener);
      });
    };
  }

  async importHandler() {
    await new Promise((resolve, reject) => {
      const opt: WorkerOptions = {
        // @ts-ignore
        name: this.name,
        env: this.environment,
        execArgv: ["--enable-source-maps"],
        workerData: {
          name: this.name,
          timeout: this.timeout,
          memorySize: this.memorySize,
          esOutputPath: this.esOutputPath,
          handlerPath: this.handlerPath,
          handlerName: this.handlerName,
          debug: log.getDebug(),
        },
      };

      this._worker = new Worker(path.resolve(moduleDirname, "./lib/runtime/runners/node/index.js"), opt);
      this._worker.setMaxListeners(0);

      const errorHandler = (err: any) => {
        this.isMounted = false;
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
          this.isMounted = true;
          this._isLoading = false;
          this.emit("loaded", true);
          resolve(undefined);
        } else if (channel == "uncaught") {
          this._worker!.terminate();
          this.isMounted = false;
          this._isLoading = false;
          log.RED(`${type} Uncaught exceptions`);

          console.error(data.error);
          if (data.solution) {
            log.BR_BLUE("Solution:");
            console.log(data.solution);
          }
        } else {
          this.emit(awsRequestId, channel, data, type, encoding);
        }
      });
      this._worker.on("error", errorHandler);
      this._worker.postMessage({ channel: "import" });
    });
  }

  onComplete = (awsRequestId: string, timeout?: boolean) => {
    this._worker?.postMessage({ channel: "complete", awsRequestId, timeout });
  };
}
