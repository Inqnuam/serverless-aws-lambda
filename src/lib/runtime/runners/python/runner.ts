import { spawn } from "child_process";
import type { ChildProcessWithoutNullStreams } from "child_process";
import path from "path";
import { watchFile } from "fs";
import { access } from "fs/promises";
import type { Runner } from "../index";

export class PythonRunner implements Runner {
  invoke: Runner["invoke"];
  mount: Runner["mount"];
  unmount: Runner["unmount"];
  name: string;
  outName: string;
  timeout: number;
  memorySize: number;
  environment: { [key: string]: any };
  handlerPath: string;
  handlerDir: string;
  handlerName: string;
  runtime: string;
  bin?: string;
  python?: ChildProcessWithoutNullStreams;
  static wrapper = __dirname.replace("/dist", "/src/lib/runtime/runners/python/index.py");
  static DELIMITER = "__|response|__";
  static ERR_RESPONSE = "__|error|__";
  constructor({
    name,
    outName,
    timeout,
    memorySize,
    environment,
    handlerPath,
    handlerName,
    runtime,
  }: {
    name: string;
    outName: string;
    handlerPath: string;
    handlerName: string;
    runtime: string;
    timeout: number;
    memorySize: number;
    environment: { [key: string]: any };
  }) {
    this.name = name;
    this.outName = outName;
    this.timeout = timeout;
    this.memorySize = memorySize;
    this.environment = environment;
    this.handlerName = handlerName;
    this.runtime = runtime;
    const tp = path.resolve(handlerPath);
    this.handlerDir = path.dirname(tp);
    this.handlerPath = path.basename(tp, `.${this.handlerName}`);

    this.mount = async () => {
      if (this.python) {
        return;
      }

      const _handlerPath = `${this.handlerDir}/${this.handlerPath}.py`;
      try {
        await access(_handlerPath);
        this.load();
        watchFile(_handlerPath, this.load);
      } catch (error) {
        console.error(`Can not find ${this.name}'s handler at: "${_handlerPath}"`);
        process.exit(1);
      }
    };
    this.unmount = () => {
      this.python?.kill();
      this.python = undefined;
    };
    this.invoke = async ({ event, info, clientContext, awsRequestId }) => {
      return new Promise((resolve, reject) => {
        const content = JSON.stringify({ event, context: clientContext ?? "" });

        const pyListener = (chunk: Buffer) => {
          let result: any = null;
          const data = chunk.toString();

          try {
            if (data.includes(PythonRunner.DELIMITER)) {
              const output = data.split(PythonRunner.DELIMITER);
              const res = output[output.length - 1];

              if (output.length > 1) {
                const printable = output.slice(0, -1).join("\n");
                if (printable.trim()) {
                  console.log(printable);
                }
              }

              if (res) {
                result = JSON.parse(res);
              }
              this.python!.stdout.removeListener("data", pyListener);
              this.python!.stderr.removeListener("data", errorHandler);
              resolve(result);
            } else if (data.trim()) {
              console.log(data);
            }
          } catch (error) {
            console.log("err", error);
            // maybe remove listener ?
            reject(error);
          }
        };
        this.python!.stdout.on("data", pyListener);

        const errorHandler = (data: Buffer) => {
          let err: any = data.toString();

          if (err.includes(PythonRunner.ERR_RESPONSE)) {
            try {
              err = JSON.parse(err.split(PythonRunner.ERR_RESPONSE)[1]);
              err.requestId = awsRequestId;
            } catch (error) {
            } finally {
              this.python!.stdout.removeListener("data", pyListener);
              this.python!.stderr.removeListener("data", errorHandler);
              reject(err);
            }
          } else {
            console.log(err);
          }
        };
        this.python!.stderr.on("data", errorHandler);
        this.python!.stdin.write(`${content}\n`);
      });
    };
  }

  load = () => {
    if (!this.bin) {
      this.bin = this.runtime.includes(".") ? this.runtime.split(".")[0] : this.runtime;
    }

    this.python = spawn(this.bin, ["-u", PythonRunner.wrapper, this.handlerDir, this.handlerPath, this.handlerName, this.name, String(this.timeout)], {
      env: this.environment,
    });

    if (!this.python.pid) {
      console.error(`Can not find ${this.bin} in your PATH`);
      process.exit(1);
    }
  };
}
