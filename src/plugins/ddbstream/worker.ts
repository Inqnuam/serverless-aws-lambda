import { parentPort, workerData } from "worker_threads";
import { DynamoStream } from "./stream";

let dynamoStream: DynamoStream;

parentPort!.on("message", async (e) => {
  const { channel } = e;

  if (channel == "init") {
    dynamoStream = new DynamoStream();

    dynamoStream.init();

    dynamoStream.on("records", (records) => {
      parentPort?.postMessage({ records });
    });
  }
});
