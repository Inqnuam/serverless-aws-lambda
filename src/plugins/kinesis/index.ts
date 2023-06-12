import { IncomingMessage } from "http";
import type { SlsAwsLambdaPlugin, ILambda } from "../../defineConfig";
import { KinesisError } from "./errors";
import { actions } from "./actions";

const ctJson = "application/x-amz-json-1.1";
const ctCbor = "application/x-amz-cbor-1.1";
const steamArnRegex = /arn:aws.*:kinesis:.*:\d{12}:stream\/\S+/;
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
const getStreamName = ({ StreamName, StreamARN }: { StreamName?: string; StreamARN?: string }) => {
  // order of tests is important
  // StreamName should be prefered over StreamARN if both are specified
  // If only StreamARN is speciied StreamName should be extraced from there
  let nameFromArn: string | undefined = undefined;
  if (typeof StreamARN == "string") {
    if (steamArnRegex.test(StreamARN)) {
      const arnComponents = StreamARN.split("/");
      nameFromArn = arnComponents[arnComponents.length - 1];
    } else {
      throw new KinesisError(
        "ValidationException",
        400,
        `1 validation error detected: Value '${StreamARN}' at 'streamARN' failed to satisfy constraint: Member must satisfy regular expression pattern: arn:aws.*:kinesis:.*:\\\d{12}:stream\\/\\\S+`
      );
    }
  }

  if (typeof StreamName == "string") {
    return StreamName;
  } else if (typeof nameFromArn == "string") {
    return nameFromArn;
  } else {
    throw new KinesisError("InternalFailure", 500, "StreamName or StreamARN must be specified");
  }
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
            const [, action] = (headers["x-amz-target"] as unknown as string).split(".");
            const requestId = headers["amz-sdk-invocation-id"] as string;
            console.log(method, url, action);
            console.log(headers);
            const body: any = await collectBody(req);
            console.log(body);

            res.setHeader("content-type", ctJson).setHeader("x-amz-request-id", requestId);

            try {
              const StreamName = getStreamName(body);

              // @ts-ignore
              const _Action = actions[action];
              const Action = new _Action(StreamName, body);
              console.log("Action", Action);
              throw new KinesisError("ResourceNotFoundException", 400, `Stream ${StreamName} under account 123456789012 not found.`);
              res.end(JSON.stringify({ StreamNames: [] }));
            } catch (error: any) {
              res.statusCode = error.status;
              res.shouldKeepAlive = false;
              res.end(error.toString());
            }
          },
        },
      ],
    },
  };
};

export default kinesisPlugin;
export { kinesisPlugin };
