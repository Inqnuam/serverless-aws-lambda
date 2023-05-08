import { parentPort, workerData } from "worker_threads";
import { createHook } from "async_hooks";
import { ResponseStream } from "../../streamResponse";
import type { WritableOptions } from "stream";

let log: any = { RED: (s: string) => void 0, BLUE: (s: string) => void 0 };
const stackRegex = /\/.*(\d+):(\d+)/;
let eventHandler: Function & { stream?: boolean; streamOpt?: any };
const invalidResponse = new Error("Invalid response payload");
const { AWS_LAMBDA_FUNCTION_NAME } = process.env;

if (workerData.debug) {
  log.RED = (s: string) => {
    process.stdout.write(`\x1b[31m${s}\x1b[0m\n`);
  };
  log.BLUE = (s: string) => {
    process.stdout.write(`\x1b[34m${s}\x1b[0m\n`);
  };
  console = new Proxy(console, {
    get(obj: any, prop: string) {
      if (typeof obj[prop] == "function") {
        return (...params: any) => {
          let stack = "";
          try {
            throw new Error();
          } catch (err: any) {
            try {
              const line = stackRegex.exec(err.stack.split("at")[2])?.[0];
              if (typeof line == "string") {
                stack = line;
              }
            } catch (e) {}
          } finally {
            process.stdout.write(`\x1b[90m${new Date().toISOString()}\t${prop.toUpperCase()}\t${AWS_LAMBDA_FUNCTION_NAME}\t${stack}\x1b[0m\n`);
            obj[prop](...params);
          }
        };
      }
      return obj[prop];
    },
  });
}

interface LambdaErrorResponse {
  errorType?: string;
  errorMessage: string;
  trace?: string[];
}
const genResponsePayload = (err: any) => {
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

const returnError = (awsRequestId: string, err: any) => {
  const data = genResponsePayload(err);
  parentPort!.postMessage({ channel: "fail", data, awsRequestId });
};

const returnResponse = (channel: string, awsRequestId: string, data: any) => {
  try {
    JSON.stringify(data);

    parentPort!.postMessage({
      channel,
      data,
      awsRequestId,
    });
  } catch (error) {
    returnError(awsRequestId, invalidResponse);
  }
};

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

class EventQueue extends Map {
  static IGNORE = ["RANDOMBYTESREQUEST", "PerformanceObserver", "TIMERWRAP"]; // ,"PROMISE",
  onEmpty?: () => void;
  requestId: string;
  constructor(requestId: string) {
    super();
    this.requestId = requestId;
  }
  isEmpty = () => {
    const resources = [...this.values()].filter((r) => {
      if (typeof r.hasRef === "function" && !r.hasRef()) return false;
      return true;
    });

    return resources.length ? false : true;
  };
  add = (asyncId: number, type: string, triggerAsyncId: number, resource: any) => {
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
          parentPort!.postMessage({ channel: "uncaught", type: timmerTime, data: { error: data, solution } });
        }
      };
    }

    if (EventQueue.IGNORE.includes(type)) {
      return this;
    }
    return this.set(asyncId, resource);
  };
  destroy = (asyncId: number) => {
    if (this.delete(asyncId) && this.isEmpty() && this.onEmpty) {
      this.onEmpty();
    }
  };
}
const listener = async (e: any) => {
  const { channel, data, awsRequestId } = e;

  if (channel == "import") {
    const handler = await import(`file://${workerData.esOutputPath}?version=${Date.now()}`);

    // workaround to esbuild bug #2494
    if (workerData.handlerName == "default" && typeof handler.default == "object" && typeof handler.default.default == "function") {
      eventHandler = handler.default.default;
    } else {
      eventHandler = handler[workerData.handlerName];
    }
    if (typeof eventHandler != "function") {
      throw new Error(`${workerData.name} > ${workerData.handlerName} is not a function`);
    }

    parentPort!.postMessage({ channel: "import" });
  } else if (channel == "exec") {
    const { event, clientContext } = data;

    let isSent = false;
    const timeout = workerData.timeout * 1000;
    let streamRes: ResponseStream;

    const resIsSent = () => {
      isSent = true;
    };
    const start = Date.now();
    const getRemainingTimeInMillis = () => {
      return Math.max(timeout - (Date.now() - start), 0);
    };
    let callbackWaitsForEmptyEventLoop = true;
    const commonContext = {
      functionVersion: "$LATEST",
      functionName: workerData.name,
      memoryLimitInMB: workerData.memorySize,
      logGroupName: `/aws/lambda/${workerData.name}`,
      logStreamName: `${new Date().toLocaleDateString()}[$LATEST]${awsRequestId.replace(/-/g, "")}`,
      clientContext,
      identity: undefined,
      invokedFunctionArn: `arn:aws:lambda:eu-west-1:00000000000:function:${workerData.name}`,
      awsRequestId,
      getRemainingTimeInMillis,
    };

    if (typeof eventHandler.stream == "boolean") {
      const streamWrite: WritableOptions["write"] = (chunk, encoding, next) => {
        parentPort!.postMessage({ channel: "stream", data: chunk, awsRequestId, type: "write", encoding });
        next();
      };
      streamRes = new ResponseStream({
        highWaterMark: eventHandler.streamOpt?.highWaterMark,
        write: streamWrite,
      });

      streamRes.on("close", () => {
        if (!isSent) {
          resIsSent();
          parentPort!.postMessage({ channel: "stream", awsRequestId, type: "end" });
        }
      });

      streamRes.on("error", (err: any) => {
        if (!isSent) {
          resIsSent();
          log.RED(err);
          returnError(awsRequestId, err);
        }
      });

      streamRes.on("ct", (contentType: string) => {
        return parentPort!.postMessage({ channel: "stream", data: contentType, awsRequestId, type: "ct" });
      });

      const streamContext = {
        get callbackWaitsForEmptyEventLoop() {
          return callbackWaitsForEmptyEventLoop;
        },
        set callbackWaitsForEmptyEventLoop(val) {
          callbackWaitsForEmptyEventLoop = val;
        },
        ...commonContext,
      };
      const ret = eventHandler(event, streamRes, streamContext)?.catch?.((err: any) => {
        streamRes.destroy();
        resIsSent();
        log.RED(err);
        returnError(awsRequestId, err);
      });

      if (typeof ret?.then !== "function") {
        resIsSent();
        streamRes.destroy();
        returnError(awsRequestId, new Error("Streaming does not support non-async handlers."));
      }
    } else {
      const eventQueue = new EventQueue(awsRequestId);

      createHook({
        init: eventQueue.add,
        destroy: eventQueue.destroy,
      }).enable();

      const context = {
        get callbackWaitsForEmptyEventLoop() {
          return callbackWaitsForEmptyEventLoop;
        },
        set callbackWaitsForEmptyEventLoop(val) {
          callbackWaitsForEmptyEventLoop = val;
        },
        ...commonContext,
        succeed: (lambdaRes: any) => {
          if (isSent) {
            return;
          }
          resIsSent();
          returnResponse("succeed", awsRequestId, lambdaRes);
        },
        fail: (err: any) => {
          if (isSent) {
            return;
          }
          resIsSent();
          returnError(awsRequestId, err);
        },
        done: function (err: any, lambdaRes: any) {
          if (isSent) {
            return;
          }
          resIsSent();

          if (err) {
            returnError(awsRequestId, err);
          } else {
            returnResponse("done", awsRequestId, lambdaRes);
          }
        },
      };

      let cbCalled: any;
      const callback = (err: any, res: any) => {
        if (!cbCalled) {
          cbCalled = {
            error: err,
            res,
          };
        }
      };
      try {
        const eventResponse = eventHandler(event, context, callback);
        // NOTE: this is a workaround for async versus callback lambda different behaviour
        eventResponse
          ?.then?.((data: any) => {
            if (cbCalled || isSent) {
              return;
            }
            resIsSent();
            returnResponse("return", awsRequestId, data);
          })

          ?.catch((err: any) => {
            resIsSent();
            returnError(awsRequestId, err);
          });

        if (!isSent && (typeof eventResponse?.then !== "function" || cbCalled)) {
          const returnCallback = () => {
            [...eventQueue.values()].forEach((r) => {
              // TODO create a method on eventQueue to destoryAll or keep the context for next invokation
              // check in AWS
              r.close?.();
            });
            if (cbCalled) {
              context.done(cbCalled.error, cbCalled.res);
            } else {
              resIsSent();
              returnResponse("return", awsRequestId, null);
            }
          };

          if (eventQueue.isEmpty()) {
            returnCallback();
          } else if (!cbCalled || callbackWaitsForEmptyEventLoop) {
            if (cbCalled && callbackWaitsForEmptyEventLoop) {
              log.BLUE("callbackWaitsForEmptyEventLoop...");
            }
            eventQueue.onEmpty = () => {
              returnCallback();
            };
          } else {
            returnCallback();
          }
        }
        // TODO: destroy all event queue resources after function is returned
      } catch (err) {
        resIsSent();
        returnError(awsRequestId, err);
      }
    }
  }
};
parentPort!.on("message", listener);
