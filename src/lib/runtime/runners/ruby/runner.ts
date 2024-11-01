import { spawn } from "child_process";
import path from "path";
import { watch } from "fs";
import { access } from "fs/promises";
import type { Runner } from "../index";
import type { ChildProcessWithoutNullStreams } from "child_process";
import type { FSWatcher } from "fs";
import { fileURLToPath } from "url";

const moduleDirname = fileURLToPath(new URL(".", import.meta.url));

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
  modulePath: string;
  handlerDir: string;
  handlerName: string;
  runtime: string;
  bin?: string;
  ruby?: ChildProcessWithoutNullStreams;
  isMounted: boolean = false;
  emitRebuild: Function;
  watcherListener: (event: "rename" | "change", filename: string | Buffer) => void;
  watchers: FSWatcher[] = [];
  static wrapper = moduleDirname.replace(`${path.sep}dist`, "/src/lib/runtime/runners/ruby/index.rb");
  static DELIMITER = "__|response|__";
  static ERR_RESPONSE = "__|error|__";
  static WATCH = "__|watch|__";
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
    this.modulePath = `${this.handlerDir}/${this.handlerPath}.rb`;
    this.mount = async () => {
      if (this.ruby) {
        return;
      }

      try {
        await access(this.modulePath);
        this.load();
      } catch (error) {
        console.error(`Can not find ${this.name}'s handler at: "${this.modulePath}"`);
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
            if (data.includes(RubyRunner.WATCH)) {
              this.setWatchFiles(data);
            } else if (data.includes(RubyRunner.DELIMITER)) {
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
      const output = data.split(RubyRunner.WATCH);
      const rawFiles = output[output.length - 1];

      const files = JSON.parse(rawFiles);
      files.push(this.modulePath);

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
      this.bin = process.platform === "win32" ? "ruby.exe" : "ruby";
    }

    this.ruby = spawn(this.bin, [RubyRunner.wrapper, this.modulePath, this.handlerName, this.name, String(this.timeout)], {
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
