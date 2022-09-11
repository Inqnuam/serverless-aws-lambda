const { Worker } = require("worker_threads");
const { resolve } = require("path");

const { randomUUID } = require("crypto");
const { EventEmitter } = require("events");

const { log } = require("./colorize.js");

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

class LambdaMock extends EventEmitter {
  constructor({ name, path, method, timeout, memorySize, environment, handlerPath, handlerName, esEntryPoint, esOutputPath, entryPoint }) {
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
    await new Promise((resolve, reject) => {
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
        log.RED("Lambda execution fatal error");
        console.error(err);

        reject(err);
      });
      this._worker.postMessage({ channel: "import" });
    });
  }
  async invoke(event, res) {
    if (!this._worker) {
      log.BR_BLUE(`❄️ Cold start '${this.name}'`);
      await this.importEventHandler();
    }

    const eventResponse = await new Promise((resolve, reject) => {
      const awsRequestId = randomUUID();

      const date = new Date();
      log.CYAN(`${date.toLocaleDateString()} ${date.toLocaleTimeString()} requestId: ${awsRequestId} | '${this.name}' ${this.method} ${this.path}`);
      this._worker.postMessage({
        channel: "exec",
        data: { event },
        awsRequestId,
      });

      this.on(awsRequestId, (channel, rawData) => {
        this.removeAllListeners(awsRequestId);

        let data;
        try {
          data = channel == "return" ? rawData : JSON.parse(rawData);
        } catch (error) {
          data = rawData;
        }
        switch (channel) {
          case "return":
            resolve(data);

            break;
          case "succeed":
            res.statusCode = data.statusCode;
            res.setHeader("Server", "awselb/2.0");
            res.setHeader("Date", new Date().toUTCString());
            if (data.headers && typeof data.headers == "object") {
              for (const [key, value] of Object.entries(data.headers)) {
                res.setHeader(key, value);
              }
            }

            res.end(data.body);
            resolve();
            break;
          case "fail":
            log.RED(data);

            res.statusCode = 502;
            res.setHeader("Content-Type", "text/html");
            res.setHeader("Server", "awselb/2.0");
            res.setHeader("Date", new Date().toUTCString());
            res.end(htmlContent502);

            resolve();
            break;
          case "done":
            res.statusCode = data.statusCode;
            res.setHeader("Server", "awselb/2.0");
            res.setHeader("Date", new Date().toUTCString());
            if (data.headers && typeof data.headers == "object") {
              for (const [key, value] of Object.entries(data.headers)) {
                res.setHeader(key, value);
              }
            }

            res.end(data.body);

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
module.exports.LambdaMock = LambdaMock;
