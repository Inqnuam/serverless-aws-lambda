const { parentPort, workerData } = require("worker_threads");
const { log } = require("./colorize");
const inspector = require("inspector");

const debuggerIsAttached = inspector.url() != undefined;

let eventHandler;
const invalidResponse = new Error("Invalid response payload");
const reachedTimeout = new Error("Timeout");
const genResponsePayload = (err) => {
  const responsePayload = {
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

const returnError = (awsRequestId, err) => {
  log.RED("Request failed");
  const data = genResponsePayload(err);
  parentPort.postMessage({ channel: "fail", data, awsRequestId });
};

const returnResponse = (channel, awsRequestId, data) => {
  try {
    JSON.stringify(data);

    parentPort.postMessage({
      channel,
      data,
      awsRequestId,
    });
  } catch (error) {
    returnError(awsRequestId, invalidResponse);
  }
};

parentPort.on("message", async (e) => {
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

    parentPort.postMessage({ channel: "import" });
  } else if (channel == "exec") {
    const { event } = data;

    let isSent = false;
    let timeout = workerData.timeout * 1000;

    const lambdaTimeoutInterval = setInterval(() => {
      timeout -= 250;

      if (timeout <= 0) {
        clearInterval(lambdaTimeoutInterval);
        if (!debuggerIsAttached) {
          isSent = true;
          returnError(awsRequestId, reachedTimeout);
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
    const context = {
      get callbackWaitsForEmptyEventLoop() {
        return callbackWaitsForEmptyEventLoop;
      },
      set callbackWaitsForEmptyEventLoop(val) {
        callbackWaitsForEmptyEventLoop = val;
      },
      succeed: (lambdaRes) => {
        if (isSent) {
          return;
        }
        resIsSent();
        returnResponse("succeed", awsRequestId, lambdaRes);
      },
      fail: (err) => {
        if (isSent) {
          return;
        }
        resIsSent();
        returnError(awsRequestId, err);
      },
      done: function (err, lambdaRes) {
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
      functionVersion: "$LATEST",
      functionName: workerData.name,
      memoryLimitInMB: workerData.memorySize,
      logGroupName: `/aws/lambda/${workerData.name}`,
      logStreamName: `${new Date().toLocaleDateString()}[$LATEST]${awsRequestId.replace(/-/g, "")}`,
      clientContext: undefined,
      identity: undefined,
      invokedFunctionArn: `arn:aws:lambda:eu-west-1:00000000000:function:${workerData.name}`,
      awsRequestId,
      getRemainingTimeInMillis,
    };

    const callback = context.done;

    // NOTE: this is a workaround for async versus callback lambda different behaviour
    try {
      const eventResponse = eventHandler(event, context, callback);

      eventResponse
        ?.then?.((data) => {
          clearInterval(lambdaTimeoutInterval);
          if (isSent) {
            return;
          }
          resIsSent();
          returnResponse("return", awsRequestId, data);
        })
        ?.catch((err) => {
          resIsSent();
          returnError(awsRequestId, err);
        });
    } catch (err) {
      resIsSent();
      returnError(awsRequestId, err);
    }
  }
});
