import { parentPort, workerData } from "worker_threads";
import { log } from "../../utils/colorize";
import inspector from "inspector";
import { ResponseStream } from "../streamResponse";
import type { WritableOptions } from "stream";

const debuggerIsAttached = inspector?.url() != undefined;
log.setDebug(workerData.debug);

let eventHandler: Function & { stream?: boolean; streamOpt?: any };
const invalidResponse = new Error("Invalid response payload");
const { AWS_LAMBDA_FUNCTION_NAME } = process.env;

class Timeout extends Error {
  constructor(timeout: number, awsRequestId: string) {
    super(`${new Date().toISOString()} ${awsRequestId} Task timed out after ${timeout} seconds`);
  }
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

  if (err instanceof Timeout) {
    responsePayload.errorMessage = err.message;
    responsePayload.errorType = "Unhandled";
    delete responsePayload.trace;
  } else if (err instanceof Error) {
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
  log.RED(`'${AWS_LAMBDA_FUNCTION_NAME}' | ${awsRequestId}: Request failed`);
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

parentPort!.on("message", async (e: any) => {
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
    let timeout = workerData.timeout * 1000;
    let streamRes: ResponseStream;
    const lambdaTimeoutInterval = setInterval(() => {
      timeout -= 250;

      if (timeout <= 0) {
        clearInterval(lambdaTimeoutInterval);
        if (!debuggerIsAttached) {
          isSent = true;
          const tm = new Timeout(workerData.timeout, awsRequestId);
          if (streamRes) {
            streamRes.destroy(tm);
          } else {
            returnError(awsRequestId, tm);
          }
        }
      }
    }, 250);

    const resIsSent = () => {
      isSent = true;
      clearInterval(lambdaTimeoutInterval);
    };

    const getRemainingTimeInMillis = () => {
      return timeout;
    };
    let callbackWaitsForEmptyEventLoop = true;
    const commonContext = {
      get callbackWaitsForEmptyEventLoop() {
        return callbackWaitsForEmptyEventLoop;
      },
      set callbackWaitsForEmptyEventLoop(val) {
        callbackWaitsForEmptyEventLoop = val;
      },

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
        if (err instanceof Timeout) {
          const data = genResponsePayload(err);
          parentPort!.postMessage({ channel: "stream", data, awsRequestId, type: "timeout" });
        } else if (!isSent) {
          resIsSent();
          log.RED(err);
          returnError(awsRequestId, err);
        }
      });

      streamRes.on("ct", (contentType: string) => {
        return parentPort!.postMessage({ channel: "stream", data: contentType, awsRequestId, type: "ct" });
      });

      const ret = eventHandler(event, streamRes, commonContext)?.catch?.((err: any) => {
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
      // NOTE: this is a workaround for async versus callback lambda different behaviour

      const context = {
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

      const callback = context.done;
      try {
        const eventResponse = eventHandler(event, context, callback);

        eventResponse
          ?.then?.((data: any) => {
            clearInterval(lambdaTimeoutInterval);
            if (isSent) {
              return;
            }
            resIsSent();
            returnResponse("return", awsRequestId, data);
          })
          ?.catch((err: any) => {
            resIsSent();
            returnError(awsRequestId, err);
          });

        if (typeof eventResponse?.then !== "function" && !isSent) {
          resIsSent();
          returnResponse("return", awsRequestId, null);
        }
      } catch (err) {
        resIsSent();
        returnError(awsRequestId, err);
      }
    }
  }
});
