import type { SlsAwsLambdaPlugin } from "../../defineConfig";
import type { ILambdaMock } from "../../lib/lambdaMock";
import { randomUUID } from "crypto";
import { parseSnsPublishBody, parseSnsPublishBatchBody, createSnsTopicEvent, getHandlersByTopicArn, genSnsPublishResponse, genSnsPublishBatchResponse } from "./utils";

export const snsPlugin = (endpoint: string = "/@sns"): SlsAwsLambdaPlugin => {
  return {
    name: "sns-plugin",
    offline: {
      request: [
        {
          method: "POST",
          filter: endpoint,
          callback: function (req, res) {
            let data = Buffer.alloc(0);
            const MessageId = randomUUID();
            const RequestId = req.headers["amz-sdk-invocation-id"] ?? randomUUID();

            req.on("data", (chunk) => {
              data += chunk;
            });

            req.on("end", async () => {
              const encodedBody = decodeURIComponent(data.toString())?.split("&");

              const Action = encodedBody.find((x) => x.startsWith("Action="))?.split("=")[1];

              if (!Action) {
                return;
              }

              if (Action == "Publish") {
                const body = parseSnsPublishBody(encodedBody);

                const foundHandlers = getHandlersByTopicArn(body, this.lambdas);
                const deduplicatedHandler: ILambdaMock[] = [];
                if (foundHandlers.length) {
                  const event = createSnsTopicEvent(body, MessageId);
                  foundHandlers.forEach((l) => {
                    if (!deduplicatedHandler.find((x) => x.name == l.name)) {
                      deduplicatedHandler.push(l);
                    }
                  });

                  for (const l of deduplicatedHandler) {
                    try {
                      await l.invoke(event);
                    } catch (error) {
                      console.log(error);
                    }
                  }
                }

                res.statusCode = 200;
                res.setHeader("Content-Type", "text/xml");

                const snsResponse = genSnsPublishResponse(MessageId, Array.isArray(RequestId) ? RequestId[0] : RequestId);
                res.end(snsResponse);
              } else if (Action == "PublishBatch") {
                const body = parseSnsPublishBatchBody(encodedBody);

                const Successful: any = [];
                const Failed: any = [];
                let handlers: ILambdaMock[] = [];

                body.Records.forEach((x, index) => {
                  const foundHandlers = getHandlersByTopicArn(x.Sns, this.lambdas);

                  const Id = body.Ids[index];
                  if (foundHandlers.length) {
                    Successful.push({ Id, MessageId: x.Sns.MessageId });

                    foundHandlers.forEach((l) => {
                      if (!handlers.find((x) => x.name == l.name)) {
                        handlers.push(l);
                      }
                    });
                  } else {
                    Failed.push({ Id, MessageId: x.Sns.MessageId });
                  }
                });

                for (const l of handlers) {
                  try {
                    await l.invoke({ Records: body.Records });
                  } catch (error) {
                    console.log(error);
                  }
                }
                res.statusCode = 200;
                res.setHeader("x-amzn-requestid", randomUUID());
                res.setHeader("Content-Type", "text/xml");
                const snsResponse = genSnsPublishBatchResponse(Array.isArray(RequestId) ? RequestId[0] : RequestId, Successful, Failed);
                res.end(snsResponse);
              } else {
                res.statusCode = 502;
                res.setHeader("Content-Type", "text/xml");
                res.end("Internal Server Error");
              }
            });
          },
        },
      ],
    },
  };
};
export default snsPlugin;
