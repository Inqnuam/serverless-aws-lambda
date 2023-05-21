import { spawn } from "child_process";
import path from "path";
import { watch } from "fs";
import { access } from "fs/promises";
import type { Runner } from "../index";
import type { ChildProcessWithoutNullStreams } from "child_process";
import type { FSWatcher } from "fs";

const cwd = process.cwd();
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
  pyModulePath: string;
  handlerDir: string;
  handlerName: string;
  runtime: string;
  bin?: string;
  python?: ChildProcessWithoutNullStreams;
  isMounted: boolean = false;
  watchers: FSWatcher[] = [];
  filesTime: Map<string, number> = new Map();
  watcherListener: (event: "rename" | "change", filename: string | Buffer) => void;
  emitRebuild: Function;
  static wrapper = __dirname.replace(`${path.sep}dist`, "/src/lib/runtime/runners/python/index.py");
  static DELIMITER = "__|response|__";
  static DELIMITEREND = "__|responseEnd|__";
  static ERR_RESPONSE = "__|error|__";
  static WATCH = "__|watch|__";
  static WATCHEND = "__|watchEnd|__";
  constructor(
    {
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
    },
    emitRebuild: Function
  ) {
    this.name = name;
    this.outName = outName;
    this.timeout = timeout;
    this.memorySize = memorySize;
    this.environment = environment;
    this.handlerName = handlerName;
    this.runtime = runtime;
    this.emitRebuild = emitRebuild;

    const tp = path.resolve(handlerPath);
    this.handlerDir = path.dirname(tp);
    this.handlerPath = path.basename(tp, `.${this.handlerName}`);
    this.pyModulePath = `${this.handlerDir}/${this.handlerPath}`.replace(cwd, "").replace(/\/|\\/g, ".").slice(1);
    this.mount = async () => {
      if (this.python) {
        return;
      }

      const _handlerPath = `${this.handlerDir}/${this.handlerPath}.py`;
      try {
        await access(_handlerPath);
        this.load();
      } catch (error) {
        console.error(`Can not find ${this.name}'s handler at: "${_handlerPath}"`);
        process.exit(1);
      }
    };
    this.unmount = (lifecycleEnds) => {
      if (lifecycleEnds) {
        this.python?.kill();
        this.python = undefined;
        this.isMounted = false;
      }
    };
    this.invoke = async ({ event, info, clientContext, awsRequestId }) => {
      return new Promise((resolve, reject) => {
        const content = JSON.stringify({ event, awsRequestId, context: clientContext ?? "" });

        const pyListener = (chunk: Buffer) => {
          let result: any = null;
          const data = chunk.toString();

          try {
            const hasWatchFiles = data.includes(PythonRunner.WATCH);
            if (hasWatchFiles) {
              this.setWatchFiles(data);
            }

            if (data.includes(PythonRunner.DELIMITER)) {
              const output = data.split(PythonRunner.DELIMITER);
              const res = output[output.length - 1].split(PythonRunner.DELIMITEREND)[0];

              if (output.length > 1) {
                let printable;
                if (hasWatchFiles) {
                  printable = output[0].split(PythonRunner.WATCHEND)[1];
                } else {
                  printable = output.slice(0, -1).join("\n");
                }
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
              let printable;
              if (hasWatchFiles) {
                printable = data.split(PythonRunner.WATCHEND)[1];
              } else {
                printable = data;
              }
              if (printable.trim()) {
                console.log(printable);
              }
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

    this.watcherListener = () => {
      if (this.isMounted) {
        this.unmount(true);
        this.watchers.forEach((x) => x.close());
        this.watchers = [];
        this.emitRebuild();
      }
    };
  }

  setWatchFiles = async (data: string) => {
    try {
      const rawOutput = data.split(PythonRunner.WATCH);
      const output = rawOutput[rawOutput.length - 1].split(PythonRunner.WATCHEND);
      const rawFiles = output[0];

      const files = JSON.parse(rawFiles).map((x: string) => `${x.replace(/\./g, path.sep)}.py`);

      for (const f of files) {
        try {
          await access(f);
          this.watchers.push(watch(f, { persistent: false }, this.watcherListener));
        } catch (error) {}
      }
    } catch (error) {
      console.log(error);
    }
  };
  load = () => {
    if (!this.bin) {
      this.bin = process.platform === "win32" ? "python" : this.runtime.includes(".") ? this.runtime.split(".")[0] : this.runtime;
    }

    this.python = spawn(this.bin, [PythonRunner.wrapper, this.pyModulePath, this.handlerName, String(this.timeout)], {
      env: this.environment,
    });

    if (!this.python.pid) {
      console.error(`Can not find ${this.bin} in your PATH`);
      process.exit(1);
    }

    this.isMounted = true;
  };
  onComplete = (awsRequestId: string) => {};
}
