import { Worker } from "worker_threads";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import * as log from "./colorize.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workerPath = resolve(__dirname, "./worker.js");
const htmlContent502 = `<html>

<head>
	<title>502 Bad Gateway</title>
</head>

<body>
	<center>
		<h1>502 Bad Gateway</h1>
	</center>
</body>

</html>`;

export class LambdaMock extends EventEmitter {
  constructor({
    name,
    path,
    method,
    timeout,
    memorySize,
    environment,
    handlerPath,
    handlerName,
    esEntryPoint,
    esOutputPath,
    entryPoint,
  }) {
    super();
    this.name = name;
    this.path = path;
    this.method = method;
    this.timeout = timeout;
    this.memorySize = memorySize;
    this.environment = environment;
    this.handlerPath = handlerPath;
    this.handlerName = handlerName;
    this.esEntryPoint = esEntryPoint;
    this.esOutputPath = esOutputPath;
    this.entryPoint = entryPoint;
  }

  async importEventHandler() {
    const workerData = {
      name: this.name,
      timeout: this.timeout,
      memorySize: this.memorySize,
      esOutputPath: this.esOutputPath,
      handlerName: this.handlerName,
    };
    await new Promise((resolve) => {
      this._worker = new Worker(workerPath, {
        env: this.environment,
        stackSizeMb: this.memorySize,
        workerData,
      });

      this._worker.on("message", (e) => {
        const { channel, data, awsRequestId } = e;
        if (channel == "import") {
          resolve();
        } else {
          this.emit(awsRequestId, channel, data);
        }
      });
      this._worker.on("error", (err) => {
        log.RED("lambda error");
        console.error(err);

        reject(err);
      });
      this._worker.postMessage({ channel: "import" });
    });
  }
  async invoke(event, res) {
    if (!this._worker) {
      log.BR_BLUE(`❄️ Cold start ${this.name}`);
      await this.importEventHandler();
    }

    const eventResponse = await new Promise((resolve, reject) => {
      const awsRequestId = randomUUID();

      const date = new Date();
      log.CYAN(
        `${date.toLocaleDateString()} ${date.toLocaleTimeString()} requestId: ${awsRequestId} | '${
          this.name
        }' ${this.method} ${this.path}`
      );
      this._worker.postMessage({
        channel: "exec",
        data: { event },
        awsRequestId,
      });

      this.on(awsRequestId, (channel, data) => {
        this.removeAllListeners(awsRequestId);

        switch (channel) {
          case "return":
            resolve(data);

            break;
          case "succeed":
            res.end(data);
            resolve();
            break;
          case "fail":
            console.error(data);

            res.statusCode = 502;
            res.setHeader("Content-Type", "text/html");
            res.end(htmlContent502);

            resolve();
            break;
          case "done":
            res.end(data);

            resolve();
            break;
          default:
            reject(new Error("Unknown error"));
            break;
        }
      });
    });

    return eventResponse;
  }
}
