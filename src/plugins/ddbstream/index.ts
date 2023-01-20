import type { SlsAwsLambdaPlugin } from "../../defineConfig";
import { Worker } from "worker_threads";
import path from "path";
let worker: Worker;
const workerPath = path.resolve(__dirname, "./worker.cjs");
// NOTE: filtering https://dev.to/aws-builders/new-dynamodb-streams-filtering-in-serverless-framework-3lc5
export const dynamoStream = (): SlsAwsLambdaPlugin => {
  throw new Error("Not fully implemented yet");
  return {
    name: "ddblocal-stream",
    onInit: async function () {
      worker = new Worker(workerPath, {
        workerData: {},
      });

      worker.on("message", ({ records }) => {
        this.lambdas;
        console.log(records[records.length - 1]);
      });
    },
    offline: {
      onReady: () => {
        worker.postMessage({ channel: "init" });
      },
    },
  };
};
