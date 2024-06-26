import { fork } from "child_process";
import type { ServerConfig } from "./config";
import type { ChildProcess } from "child_process";

const exitEvents = [
  "exit",
  "beforeExit",
  "uncaughtException",
  "unhandledRejection",
  "SIGHUP",
  "SIGINT",
  "SIGQUIT",
  "SIGILL",
  "SIGTRAP",
  "SIGABRT",
  "SIGBUS",
  "SIGFPE",
  "SIGUSR1",
  "SIGSEGV",
  "SIGUSR2",
  "SIGTERM",
];
export class Server {
  #cmd?: ChildProcess;
  #exitEvents = exitEvents;
  #config: ServerConfig;
  constructor(config?: ServerConfig) {
    this.#config = config ?? {};
  }

  async start(): Promise<{ port: string; ip: string }> {
    this.#exitEvents.forEach((e) => {
      process.on(e, () => {
        this.stop();
      });
    });

    const args = ["aws-lambda"];

    if (this.#config.stage) {
      args.push("-s", "dev");
    }
    if (!this.#config.watch) {
      args.push("-w", "false");
    }
    let env: any = { ...process.env, PORT: this.#config.port };

    if (this.#config.debug) {
      env.SLS_DEBUG = "*";
    }
    this.#cmd = fork(`${process.cwd()}/node_modules/serverless/bin/serverless`, args, { env });

    this.#cmd!.on("message", ({ rebuild }: { rebuild: boolean }) => {
      if (rebuild) {
        this.#config.onRebuild?.();
      }
    });

    return new Promise((resolve, reject) => {
      this.#cmd!.on("message", ({ port, ip }: { port: string; ip: string }) => {
        if (port) {
          resolve({ port, ip });
        }
      });
    });
  }
  stop() {
    const killed = this.#cmd?.kill();
    return killed;
  }
}

export type { ServerConfig };
export { exitEvents };
