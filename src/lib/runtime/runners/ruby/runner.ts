import { spawn } from "child_process";
import path from "path";
import { watch } from "fs";
import { access } from "fs/promises";
import type { Runner } from "../index";
import type { ChildProcessWithoutNullStreams } from "child_process";

export class RubyRunner implements Runner {
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
  ruby?: ChildProcessWithoutNullStreams;
  isMounted: boolean = false;
  emitRebuild: Function;
  static wrapper = __dirname.replace("/dist", "/src/lib/runtime/runners/ruby/index.rb");
  static DELIMITER = "__|response|__";
  static ERR_RESPONSE = "__|error|__";
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
    this.pyModulePath = `${this.handlerDir}/${this.handlerPath}.rb`;
    this.mount = async () => {
      if (this.ruby) {
        return;
      }

      const _handlerPath = `${this.handlerDir}/${this.handlerPath}.rb`;
      try {
        await access(_handlerPath);
        this.load();
        watch(_handlerPath, { persistent: false }, () => {
          if (this.isMounted) {
            this.unmount(true);
            this.emitRebuild();
          }
        });
      } catch (error) {
        console.error(`Can not find ${this.name}'s handler at: "${_handlerPath}"`);
        process.exit(1);
      }
    };
    this.unmount = (lifecycleEnds) => {
      if (lifecycleEnds) {
        this.ruby?.kill();
        this.ruby = undefined;
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
            if (data.includes(RubyRunner.DELIMITER)) {
              const output = data.split(RubyRunner.DELIMITER);
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
              this.ruby!.stdout.removeListener("data", pyListener);
              this.ruby!.stderr.removeListener("data", errorHandler);
              resolve(result);
            } else if (data.trim()) {
              console.log(data);
            }
          } catch (error) {
            // maybe remove listener ?
            reject(error);
          }
        };
        this.ruby!.stdout.on("data", pyListener);

        const errorHandler = (data: Buffer) => {
          let err: any = data.toString();

          if (err.includes(RubyRunner.ERR_RESPONSE)) {
            try {
              err = JSON.parse(err.split(RubyRunner.ERR_RESPONSE)[1]);
              err.requestId = awsRequestId;
            } catch (error) {
            } finally {
              this.ruby!.stdout.removeListener("data", pyListener);
              this.ruby!.stderr.removeListener("data", errorHandler);
              reject(err);
            }
          } else {
            console.log(err);
          }
        };
        this.ruby!.stderr.on("data", errorHandler);
        this.ruby!.stdin.write(`${content}\n`);
      });
    };
  }

  load = () => {
    if (!this.bin) {
      this.bin = process.platform === "win32" ? "ruby.exe" : "ruby";
    }

    this.ruby = spawn(this.bin, [RubyRunner.wrapper, this.pyModulePath, this.handlerName, this.name, String(this.timeout)], {
      env: this.environment,
      shell: true,
    });

    if (!this.ruby.pid) {
      console.error(`Can not find ${this.bin} in your PATH`);
      process.exit(1);
    }
    this.isMounted = true;
  };
  onComplete = (awsRequestId: string) => {};
}
