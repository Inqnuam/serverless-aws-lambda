import type { IncomingMessage, ServerResponse } from "http";
import type { SlsAwsLambdaPlugin } from "../../defineConfig";
import type { QueueAttributes } from "./types";
import { getQueues } from "./utils";
import { createRequestHandler, type ISqsServerOptions } from "local-aws-sqs";

export const sqsPlugin = (
  attributes?: QueueAttributes,
  serviceOptions?: Pick<ISqsServerOptions, "emulateLazyQueues" | "emulateQueueCreationLifecycle" | "validateDlqDestination">
): SlsAwsLambdaPlugin => {
  let sqsRequestHandler = (req: IncomingMessage, res: ServerResponse) => {};
  let region: string | undefined = undefined;
  let accountId: string | undefined = undefined;

  let validateDlqDestination = false;
  let emulateQueueCreationLifecycle = false;
  let emulateLazyQueues = false;

  if (serviceOptions) {
    if (typeof serviceOptions.validateDlqDestination == "boolean") {
      validateDlqDestination = serviceOptions.validateDlqDestination;
    }

    if (typeof serviceOptions.emulateQueueCreationLifecycle == "boolean") {
      emulateQueueCreationLifecycle = serviceOptions.emulateQueueCreationLifecycle;
    }

    if (typeof serviceOptions.emulateLazyQueues == "boolean") {
      emulateLazyQueues = serviceOptions.emulateLazyQueues;
    }
  }

  const onReadyListener: Function[] = [];

  const notifyReadyState = async () => {
    self.pluginData.isReady = true;

    for (const fn of onReadyListener) {
      try {
        await fn();
      } catch (error) {}
    }
  };

  const self: SlsAwsLambdaPlugin = {
    name: "sqs-plugin",
    pluginData: {
      isReady: false,
      onReady: (cb: Function) => {
        if (typeof cb == "function") {
          onReadyListener.push(cb);
        } else {
          console.warn("onReady callback must be a function");
        }
      },
    },
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
    server: {
      async onReady(port, ip) {
        if (!this.getServices().sqs) {
          await this.setServices({ sqs: { region: "us-east-1", endpoint: `http://localhost:${port}/@sqs`, credentials: { accessKeyId: "fake", secretAccessKey: "fake" } } });
        }

        sqsRequestHandler = createRequestHandler({
          port: port,
          region,
          accountId,
          validateDlqDestination,
          emulateQueueCreationLifecycle,
          emulateLazyQueues,
          baseUrl: "/@sqs/",
          queues: getQueues(this.resources.sqs, this.lambdas, attributes),
        });
        notifyReadyState();
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

  return self;
};

export default sqsPlugin;
