import { parentPort, workerData } from "worker_threads";
import { ResponseStream } from "../../streamResponse";
import { genResponsePayload, EventQueue, patchConsole, formatStack } from "./utils";
import { inspect } from "util";
import type { WritableOptions } from "stream";

let log = { RED: (s: string) => {}, BLUE: (s: string) => {}, PINK: (s: string) => {} };

let eventHandler: Function & { stream?: boolean; streamOpt?: any };
const invalidResponse = new Error("Invalid response payload");

if (workerData.debug) {
  log.RED = (s: string) => {
    process.stdout.write(`\x1b[31m${s}\x1b[0m\n`);
  };
  log.BLUE = (s: string) => {
    process.stdout.write(`\x1b[34m${s}\x1b[0m\n`);
  };
  log.PINK = (s: string) => {
    process.stdout.write(`\x1b[95m${s}\x1b[0m\n`);
  };
  patchConsole();
}
EventQueue.parentPort = parentPort;

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

//@ts-ignore
process.exit = (code?: number | undefined) => {
  process.stdout.write(`\x1b[31musage of process.exit() will throw Runtime error in AWS Lambda\x1b[0m\n`);
};

process.on("unhandledRejection", (er) => {
  process.stdout.write(inspect(er));
});

process.on("uncaughtException", (er) => {
  process.stdout.write(inspect(er));
});

const listener = async (e: any) => {
  const { channel, data, awsRequestId } = e;

  if (channel == "import") {
    let handler;
    try {
      handler = await import(`file://${workerData.esOutputPath}?version=${Date.now()}`);
    } catch (err) {
      returnError(awsRequestId, err);
      return;
    }

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
  } else if (channel == "complete") {
    const ctx = EventQueue.context[awsRequestId];
    if (typeof e.timeout == "boolean") {
      ctx.timeout = true;
    }
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

    const eventQueue = new EventQueue(awsRequestId);
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
          return eventQueue.callbackWaitsForEmptyEventLoop;
        },
        set callbackWaitsForEmptyEventLoop(val) {
          eventQueue.callbackWaitsForEmptyEventLoop = val;
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
      const context = {
        get callbackWaitsForEmptyEventLoop() {
          return eventQueue.callbackWaitsForEmptyEventLoop;
        },
        set callbackWaitsForEmptyEventLoop(val) {
          eventQueue.callbackWaitsForEmptyEventLoop = val;
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
        } else {
          log.RED("Invocation has already been reported as done. Cannot call complete more than once per invocation.");
        }
      };

      try {
        eventQueue.enable();
        const eventResponse = eventHandler(event, context, callback);
        // NOTE: this is a workaround for async versus callback lambda different behaviour
        eventResponse
          ?.then?.((data: any) => {
            eventQueue.storeContextTimers();
            EventQueue.logTimeoutPossibleCause(awsRequestId);

            if (cbCalled || isSent) {
              return;
            }
            resIsSent();
            returnResponse("return", awsRequestId, data);
            eventQueue.disable();
          })
          ?.catch((err: any) => {
            resIsSent();
            returnError(awsRequestId, err);
            eventQueue.disable();
          });

        eventQueue.async = typeof eventResponse?.then == "function";

        if (!eventQueue.async && eventResponse) {
          log.RED("Synchronous handler 'return' value is ignored. Consider marking your handler as 'async' or use callback(error, returnValue)");
        }

        if (!isSent && (!eventQueue.async || cbCalled)) {
          const returnCallback = () => {
            eventQueue.storeContextTimers();
            eventQueue.disable();
            if (cbCalled) {
              context.done(cbCalled.error, cbCalled.res);
            } else {
              resIsSent();
              returnResponse("return", awsRequestId, null);
            }
          };

          if (eventQueue.isEmpty()) {
            returnCallback();
          } else if (!cbCalled || eventQueue.callbackWaitsForEmptyEventLoop) {
            if (cbCalled && eventQueue.callbackWaitsForEmptyEventLoop) {
              log.BLUE("callbackWaitsForEmptyEventLoop...");
              const events = [...eventQueue.values()];
              const last = events[events.length - 1];
              const stack = formatStack(last.stack);
              if (stack) {
                log.RED("Blocked by:");
                log.PINK(stack);
              }
            }

            eventQueue.onEmpty = () => {
              returnCallback();
            };
          } else {
            returnCallback();
          }
        }
      } catch (err) {
        resIsSent();
        returnError(awsRequestId, err);
        eventQueue.disable();
      }
    }
  }
};
parentPort!.on("message", listener);
