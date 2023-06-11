import { IncomingMessage } from "http";
import type { SlsAwsLambdaPlugin, ILambda } from "../../defineConfig";

const ctJson = "application/x-amz-json-1.1";
const ctCbor = "application/x-amz-cbor-1.1";

const collectBody = (req: IncomingMessage) => {
  return new Promise((resolve, reject) => {
    let body: Buffer;

    req.on("end", () => {
      try {
        resolve(JSON.parse(body.toString()));
      } catch (error) {
        reject("Malformed body");
      }
    });

    req.on("data", (chunk) => {
      body = body ? Buffer.concat([body, chunk]) : chunk;
    });
  });
};

const kinesisPlugin = (): SlsAwsLambdaPlugin => {
  return {
    name: "kinesis-plugin",
    onInit: function () {
      const lambdas = this.lambdas.filter((x) => x.kinesis.length);
      console.log(lambdas[0].kinesis);
    },
    offline: {
      request: [
        {
          method: "POST",
          filter: "/@kinesis/",
          callback: async function (req, res) {
            const { headers, url, method } = req;
            const [, Action] = (headers["x-amz-target"] as unknown as string).split(".");
            const requestId = headers["amz-sdk-invocation-id"] as string;
            console.log(method, url, Action);
            console.log(headers);
            const body = await collectBody(req);
            console.log(body);
            res.setHeader("content-type", ctJson).setHeader("x-amz-request-id", requestId);
            res.end(JSON.stringify({ StreamNames: [] }));
          },
        },
      ],
    },
  };
};

export default kinesisPlugin;
export { kinesisPlugin };
