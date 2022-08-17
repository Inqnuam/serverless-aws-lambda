import { parentPort, workerData } from "worker_threads";
import inspector from "inspector";

const debuggerIsAttached = inspector.url() != undefined;

let eventHandler;

parentPort.on("message", async (e) => {
  const { channel, data, awsRequestId } = e;

  if (channel == "import") {
    const handler = await import(
      `${workerData.esOutputPath}?version=${Date.now()}`
    );
    eventHandler = handler[workerData.handlerName];
    parentPort.postMessage({ channel: "import" });
  } else if (channel == "exec") {
    const { event } = data;

    let isSent = false;
    const resIsSent = () => {
      isSent = true;
    };

    let timeout = workerData.timeout * 1000;

    const lambdaTimeoutInterval = setInterval(() => {
      timeout -= 250;

      if (timeout <= 0) {
        clearInterval(lambdaTimeoutInterval);
        if (!debuggerIsAttached) {
          parentPort.postMessage({ channel: "fail", data: "timeout" });
        }
      }
    }, 250);

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
        clearInterval(lambdaTimeoutInterval);

        parentPort.postMessage({
          channel: "succeed",
          data: lambdaRes,
          awsRequestId,
        });
      },
      fail: (err) => {
        if (isSent) {
          return;
        }
        resIsSent();
        clearInterval(lambdaTimeoutInterval);
        parentPort.postMessage({ channel: "fail", data: err, awsRequestId });
      },
      done: (err, lambdaRes) => {
        if (isSent) {
          return;
        }
        // TODO: check what to do with err
        resIsSent();
        clearInterval(lambdaTimeoutInterval);

        parentPort.postMessage({
          channel: "done",
          data: lambdaRes,
          awsRequestId,
        });
      },
      functionVersion: "$LATEST",
      functionName: workerData.name,
      memoryLimitInMB: workerData.memorySize,
      logGroupName: `/aws/lambda/${workerData.name}`,
      logStreamName: `${new Date().toLocaleDateString()}[$LATEST]${awsRequestId.replace(
        /-/g,
        ""
      )}`,
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
