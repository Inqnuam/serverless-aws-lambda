import { createHook } from "async_hooks";
import { inspect } from "util";
import path from "path";
import type { MessagePort } from "worker_threads";
import type { AsyncHook } from "async_hooks";
interface LambdaErrorResponse {
  errorType?: string;
  errorMessage: string;
  trace?: string[];
}

const cwd = process.cwd();
const router = `/dist/lambda/router.`;
const root = cwd.split(path.sep).filter(Boolean)[0];
const stackRegex = new RegExp(`\\((\/${root}|${root}).*(\\d+):(\\d+)`);
const orgCT = clearTimeout.bind(clearTimeout);
const { AWS_LAMBDA_FUNCTION_NAME } = process.env;

const genSolution = (fn: string) => {
  const body = fn.match(/{[\w\W]*}/);

  if (body) {
    const solution = `${fn.slice(0, body.index! + 1)}
  \x1b[33m  try {\x1b[0m
      ${fn.slice(body.index! + 1, -1).trim()}
  \x1b[33m  } catch (error) {\x1b[0m
    \x1b[35m  // handle the error\x1b[0m
  \x1b[33m  }\x1b[0m
}`;
    return solution;
  }
};

export const genResponsePayload = (err: any) => {
  const responsePayload: LambdaErrorResponse = {
    errorType: "string",
    errorMessage: "",
    trace: [],
  };

  if (err instanceof Error) {
    responsePayload.errorType = err.name;
    responsePayload.errorMessage = err.message;

    if (typeof err.stack == "string") {
      responsePayload.trace = err.stack.split("\n");
    }
  } else {
    responsePayload.errorType = typeof err;

    try {
      responsePayload.errorMessage = err.toString();
    } catch (error) {}
  }

  return responsePayload;
};

const getStackLine = (e: any) => {
  let stack = "";
  try {
    // @ts-ignore
    const line = stackRegex.exec(e.stack.split("at")[2])?.[0];
    if (typeof line == "string") {
      stack = line.slice(1);
    }
  } catch (error) {}
  return stack;
};
export const patchConsole = () => {
  console = new Proxy(console, {
    get(self: any, prop: string) {
      if (typeof self[prop] == "function") {
        return (...params: any) => {
          const e = {};
          Error.captureStackTrace(e);
          const stack = getStackLine(e);
          process.stdout.write(`\x1b[90m${new Date().toISOString()}\t${prop.toUpperCase()}\t${AWS_LAMBDA_FUNCTION_NAME}\t${stack}\x1b[0m\n`);
          if (prop == "log") {
            self.log(...params.map((x: any) => inspect(x, { colors: true })));
          } else {
            self[prop](...params);
          }
        };
      }
      return self[prop];
    },
  });
};

export const formatStack = (_stack: string[]) => {
  let stack = "";
  let indent = 0;
  _stack
    .slice()
    .reverse()
    .filter((s: string) => s && !s.includes(__dirname) && !s.includes(router))
    .forEach((x) => {
      const line = stackRegex.exec(x)?.[0];
      if (line) {
        stack += `${line}\n`.slice(1);
        indent++;
        stack += " ".repeat(indent);
      }
    });
  return stack;
};

interface IEventQueueContext {
  [id: string]: {
    timers: Map<number, any>;
    promises: Map<number, any>;
    timeout?: boolean;
  };
}

export class EventQueue extends Map {
  static IGNORE = ["PROMISE", "RANDOMBYTESREQUEST", "PerformanceObserver", "TIMERWRAP"];
  onEmpty?: () => void;
  requestId: string;
  callbackWaitsForEmptyEventLoop = true;
  async = false;
  hook?: AsyncHook;
  static context: IEventQueueContext = {};
  static parentPort: MessagePort | null;
  static logTimeoutPossibleCause = (requestId: string) => {
    const ctx = this.context[requestId];
    if (!ctx.timeout) {
      return;
    }
    let stacks = [...ctx.promises.values()].reduce((accum, x) => {
      if (x.took) {
        x.stack = x.stack
          .reverse()
          .map((s: string) => {
            const fPath = stackRegex.exec(s)?.[0];
            if (fPath) {
              return fPath.slice(1);
            }
          })
          .filter((s: string) => s && !s.includes(__dirname) && !s.includes(router));

        if (x.stack.length) {
          delete x.start;
          accum.push(x);
        }
      }
      return accum;
    }, []);

    stacks = stacks.filter((x: any, i: number) => {
      if (x.took > 0.01) {
        return x.stack.every((s: string) => stacks.find((e: any, ii: number) => i != ii && (e.took > x.took || x.stack.length < e.stack.length) && e.stack.includes(s)))
          ? false
          : true;
      }
    });
    if (stacks.length) {
      const msg = inspect(stacks, { colors: true });
      process.stdout.write(`'${AWS_LAMBDA_FUNCTION_NAME}' Timeout possible cause:\n${msg}\n`);
    }
  };

  constructor(requestId: string) {
    super();
    this.requestId = requestId;
    EventQueue.context[requestId] = {
      timers: new Map(),
      promises: new Map(),
    };
  }

  static restoreContext = () => {
    Object.values(this.context).forEach(({ timers }) => {
      const entries = [...timers.entries()];

      if (entries.length) {
        process.stdout.write(`\x1b[31mWarning! Restoring context from previous invokation...\nThis may lead to data leak.\x1b[0m\n`);
      }

      entries.forEach(([id, timer]) => {
        if (timer.interval) {
          setInterval(timer._onTimeout, timer.interval);
        } else {
          setTimeout(timer._onTimeout, timer.timerValue);
        }
        timers.delete(id);
      });
    });
  };
  storeContextTimers = () => {
    [...this.entries()].forEach(([id, timer]) => {
      if (timer.type != "Timeout") {
        return;
      }
      const { _idleTimeout, _idleStart, _onTimeout, _repeat } = timer.resource;

      const timerValue = _idleTimeout - _idleStart;
      if (timerValue > -1 || _repeat) {
        EventQueue.context[this.requestId].timers.set(id, { timerValue, _onTimeout, interval: _repeat });
      }

      clearTimeout(timer.resource);
    });
  };
  isEmpty = () => {
    const resources = [...this.values()].filter((r) => {
      if (typeof r.resource.hasRef === "function" && !r.resource.hasRef()) return false;
      return true;
    });

    return resources.length > 0 ? false : true;
  };
  add = (asyncId: number, type: string, triggerAsyncId: number, resource: any) => {
    const e = {};
    Error.captureStackTrace(e);
    // @ts-ignore
    const stack = e.stack.split("\n").slice(7);
    if (type == "PROMISE") {
      EventQueue.context[this.requestId].promises.set(asyncId, { stack, start: Date.now() });
    }
    if (EventQueue.IGNORE.includes(type)) {
      return this;
    }
    if (type == "Timeout") {
      const timmerTime = resource._repeat ? "setInterval" : "setTimeout";
      const fnString = resource._onTimeout.toString();
      const org = resource._onTimeout.bind(resource._onTimeout);
      resource._onTimeout = () => {
        try {
          org();
        } catch (error) {
          const data = genResponsePayload(error);
          const solution = genSolution(fnString);
          EventQueue.parentPort!.postMessage({ channel: "uncaught", type: timmerTime, data: { error: data, solution } });
        }
      };
    }

    return this.set(asyncId, { resource, triggerAsyncId, type, stack });
  };
  destroy = (asyncId: number) => {
    if (this.delete(asyncId) && this.isEmpty() && this.onEmpty) {
      this.onEmpty();
    }
  };
  resolve = (asyncId: number) => {
    const ctx = EventQueue.context[this.requestId];
    if (ctx) {
      const resource = ctx.promises.get(asyncId);
      if (resource?.start) {
        resource.took = (Date.now() - resource.start) / 1000;
      }
    }
  };
  enable = () => {
    EventQueue.restoreContext();
    // in async funtions destroy() hook is called once promise is resolved which is not sufficient to call storeContextTimers safely
    const self = this;
    //@ts-ignore
    const customCT = function clearTimeout(timer) {
      orgCT(timer);
      self.destroy(Number(timer));
    };
    global.clearTimeout = customCT;
    global.clearInterval = customCT;
    this.hook = createHook({
      init: this.add,
      destroy: this.destroy,
      promiseResolve: this.resolve,
    }).enable();
  };
  disable = () => {
    this.hook?.disable();
    delete this.hook;
  };
}
