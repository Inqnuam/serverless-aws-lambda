const { parentPort, workerData } = require("worker_threads");
const inspector = require("inspector");

const debuggerIsAttached = inspector.url() != undefined;

let eventHandler;

parentPort.on("message", async (e) => {
  const { channel, data, awsRequestId } = e;

  if (channel == "import") {
    const handler = await import(`file://${workerData.esOutputPath}?version=${Date.now()}`);

    // workaround to ES bug
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
          parentPort.postMessage({ channel: "fail", data: "_timeout_", awsRequestId });
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

    const context = {
      callbackWaitsForEmptyEventLoop: true,
      succeed: (lambdaRes) => {
        if (isSent) {
          return;
        }
        resIsSent();

        let data;
        if (typeof lambdaRes == "object" && lambdaRes.statusCode) {
          data = JSON.stringify(lambdaRes);
        } else {
          const errMsg = `typeof 'succeed' content value must be an object, including at least 'statusCode' key-value.\nReceived: ${typeof lambdaRes}=>\n${lambdaRes} `;

          throw new Error(errMsg);
        }
        parentPort.postMessage({
          channel: "succeed",
          data,
          awsRequestId,
        });
      },
      fail: (err) => {
        if (isSent) {
          return;
        }
        console.error(err);
        resIsSent();

        parentPort.postMessage({ channel: "fail", data: "Request failed", awsRequestId });
      },
      done: (err, lambdaRes) => {
        if (isSent) {
          return;
        }
        // TODO: check what to do with err
        resIsSent();

        let data;
        if (typeof lambdaRes == "object" && lambdaRes.statusCode) {
          data = JSON.stringify(lambdaRes);
        } else {
          const errMsg = `typeof 'done' content value must be an object, including at least 'statusCode' key-value.\nReceived: ${typeof lambdaRes}=>\n${lambdaRes} `;

          throw new Error(errMsg);
        }

        parentPort.postMessage({
          channel: "done",
          data: data,
          awsRequestId,
        });
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

    try {
      const eventResponse = await eventHandler(event, context);
      clearInterval(lambdaTimeoutInterval);
      if (!isSent) {
        parentPort.postMessage({
          channel: "return",
          data: eventResponse,
          awsRequestId,
        });
      }
    } catch (error) {
      context.fail(error);
    }
  }
});
