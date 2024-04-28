import type { IncomingMessage, ServerResponse } from "http";
import type { SlsAwsLambdaPlugin } from "../../defineConfig";
import type { QueueAttributes } from "./types";
import { getQueues } from "./utils";
import { createRequestHandler } from "local-aws-sqs";

export const sqsPlugin = (attributes?: QueueAttributes): SlsAwsLambdaPlugin => {
  let sqsRequestHandler = (req: IncomingMessage, res: ServerResponse) => {};
  let region: string | undefined = undefined;
  let accountId: string | undefined = undefined;

  return {
    name: "sqs-plugin",
    onInit: function () {
      if (!this.isDeploying && !this.isPackaging) {
        const slsRegion = this.serverless.service.provider.region;

        if (slsRegion) {
          region = slsRegion;
        }

        // @ts-ignore
        if (this.serverless.providers?.aws?.accountId) {
          // @ts-ignore
          accountId = this.serverless.providers.aws!.accountId;
        }
      }
    },
    offline: {
      async onReady(port, ip) {
        if (!this.getServices().sqs) {
          await this.setServices({ sqs: { region: "us-east-1", endpoint: `http://localhost:${port}/@sqs`, credentials: { accessKeyId: "fake", secretAccessKey: "fake" } } });
        }

        sqsRequestHandler = createRequestHandler({
          port: port,
          region,
          accountId,
          validateDlqDestination: false,
          emulateQueueCreationLifecycle: false,
          baseUrl: "/@sqs/",
          queues: getQueues(this.resources.sqs, this.lambdas, attributes),
        });
      },
      request: [
        {
          method: "POST",
          filter: "/@sqs",
          callback: function (req, res) {
            sqsRequestHandler(req, res);
          },
        },
      ],
    },
  };
};

export default sqsPlugin;
