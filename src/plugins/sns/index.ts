import type { SlsAwsLambdaPlugin, ILambda } from "../../defineConfig";
import { randomUUID } from "crypto";
import { parseSnsPublishBody, parseSnsPublishBatchBody, createSnsTopicEvent, getHandlersByTopicArn, genSnsPublishResponse, genSnsPublishBatchResponse } from "./utils";

export const snsPlugin = (): SlsAwsLambdaPlugin => {
  return {
    name: "sns-plugin",
    offline: {
      request: [
        // only for internal usage
        {
          method: "POST",
          filter: "/@sns/parsed",
          callback: function (req, res) {
            let data = Buffer.alloc(0);
            const MessageId = randomUUID();
            const RequestId = req.headers["amz-sdk-invocation-id"] ?? randomUUID();

            req.on("data", (chunk) => {
              data += chunk;
            });

            req.on("end", async () => {
              const body = JSON.parse(data.toString());
              const foundHandlers = getHandlersByTopicArn(body, this.lambdas);
              const deduplicatedHandler: { handler: ILambda; event: any }[] = [];
              if (foundHandlers.length) {
                const event = createSnsTopicEvent(body, MessageId);
                foundHandlers.forEach((l) => {
                  if (!deduplicatedHandler.find((x) => x.handler.name == l.handler.name)) {
                    deduplicatedHandler.push(l);
                  }
                });

                for (const { handler, event: info } of deduplicatedHandler) {
                  try {
                    await handler.invoke(event, { kind: "sns", event: info });
                  } catch (error) {
                    console.log(error);
                  }
                }
              }

              res.statusCode = 200;
              res.setHeader("Content-Type", "text/xml");

              const snsResponse = genSnsPublishResponse(MessageId, Array.isArray(RequestId) ? RequestId[0] : RequestId);
              res.end(snsResponse);
            });
          },
        },
        {
          method: "POST",
          filter: "/@sns",
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
                const deduplicatedHandler: { handler: ILambda; event: any }[] = [];
                if (foundHandlers.length) {
                  const event = createSnsTopicEvent(body, MessageId);
                  foundHandlers.forEach((l) => {
                    if (!deduplicatedHandler.find((x) => x.handler.name == l.handler.name)) {
                      deduplicatedHandler.push(l);
                    }
                  });

                  for (const { handler, event: info } of deduplicatedHandler) {
                    try {
                      await handler.invoke(event, { kind: "sns", event: info });
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
                let handlers: { handler: ILambda; event: any }[] = [];

                body.Records.forEach((x, index) => {
                  const foundHandlers = getHandlersByTopicArn(x.Sns, this.lambdas);

                  const Id = body.Ids[index];
                  if (foundHandlers.length) {
                    Successful.push({ Id, MessageId: x.Sns.MessageId });

                    foundHandlers.forEach((l) => {
                      if (!handlers.find((x) => x.handler.name == l.handler.name)) {
                        handlers.push(l);
                      }
                    });
                  } else {
                    Failed.push({ Id, MessageId: x.Sns.MessageId });
                  }
                });

                for (const { handler, event: info } of handlers) {
                  try {
                    await handler.invoke({ Records: body.Records }, { kind: "sns", event: info });
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
