import type { SlsAwsLambdaPlugin, ILambda } from "../../defineConfig";
import { randomUUID } from "crypto";
import { parseSnsPublishBody, parseSnsPublishBatchBody, createSnsTopicEvent, getHandlersByTopicArn, genSnsPublishResponse, genSnsPublishBatchResponse } from "./utils";
import { SnsError } from "./errors";

// TODO: Handle as we do with SQS
// trigger DLQ when no subsriber is found
export const snsPlugin = (): SlsAwsLambdaPlugin => {
  return {
    name: "sns-plugin",
    server: {
      request: [
        // @internal
        {
          method: "POST",
          filter: "/@sns/parsed",
          callback: async function (req, res) {
            let data = Buffer.alloc(0);
            const MessageId = randomUUID();
            const RequestId = (req.headers["amz-sdk-invocation-id"] ?? randomUUID()) as string;

            req.on("data", (chunk) => {
              data += chunk;
            });

            const body = await new Promise((resolve) => {
              req.on("end", async () => {
                resolve(JSON.parse(data.toString()));
              });
            });

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
                let msg = `SNS: ${info.name}`;
                if (info.displayName) {
                  msg += ` | ${info.displayName}`;
                }
                console.log(`\x1b[35m${msg}\x1b[0m`);
                try {
                  await handler.invoke(event, { kind: "sns", event: info });
                } catch (error) {
                  console.log(error);
                }
              }
            }

            res.statusCode = 200;
            res.setHeader("Content-Type", "text/xml");

            const snsResponse = genSnsPublishResponse(MessageId, RequestId);
            res.end(snsResponse);
          },
        },
        {
          method: "POST",
          filter: "/@sns",
          callback: async function (req, res) {
            let data = Buffer.alloc(0);
            const MessageId = randomUUID();
            const RequestId = (req.headers["amz-sdk-invocation-id"] ?? randomUUID()) as string;

            const handleError = (error: any) => {
              res.statusCode = 400;

              if (error instanceof SnsError) {
                res.end(error.toXml(RequestId));
              } else {
                res.end(SnsError.genericErrorResponse({ RequestId, Message: error.toString?.() ?? "Unknown error" }));
              }
            };
            res.setHeader("Content-Type", "text/xml");
            res.setHeader("x-amzn-requestid", randomUUID());

            req.on("data", (chunk) => {
              data += chunk;
            });

            const encodedBody: string[] = await new Promise((resolve) => {
              req.on("end", async () => {
                resolve(decodeURIComponent(data.toString())?.split("&"));
              });
            });
            const Action = encodedBody.find((x) => x.startsWith("Action="))?.split("=")[1];

            if (!Action) {
              return;
            }

            if (Action == "Publish") {
              try {
                const body = parseSnsPublishBody(encodedBody);

                const foundHandlers = getHandlersByTopicArn(body, this.lambdas);
                const deduplicatedHandler: { handler: ILambda; event: any }[] = [];
                const event = createSnsTopicEvent(body, MessageId);

                if (foundHandlers.length) {
                  foundHandlers.forEach((l) => {
                    if (!deduplicatedHandler.find((x) => x.handler.name == l.handler.name)) {
                      deduplicatedHandler.push(l);
                    }
                  });

                  for (const { handler, event: info } of deduplicatedHandler) {
                    let msg = `SNS: ${info.name}`;
                    if (info.displayName) {
                      msg += ` | ${info.displayName}`;
                    }
                    console.log(`\x1b[35m${msg}\x1b[0m`);
                    try {
                      await handler.invoke(event, { kind: "sns", event: info });
                    } catch (error) {
                      console.log(error);
                    }
                  }
                }

                res.statusCode = 200;

                const snsResponse = genSnsPublishResponse(MessageId, RequestId);
                res.end(snsResponse);
              } catch (error) {
                handleError(error);
              }
            } else if (Action == "PublishBatch") {
              try {
                const body = parseSnsPublishBatchBody(encodedBody);
                const Successful: any = [];
                const Failed = body.Failed;
                let handlers: { handler: ILambda; event: any }[] = [];

                body.Records.forEach((x, index) => {
                  const Id = body.Ids[index];
                  Successful.push({ Id, MessageId: x.Sns.MessageId });
                  const foundHandlers = getHandlersByTopicArn(x.Sns, this.lambdas);

                  if (foundHandlers.length) {
                    foundHandlers.forEach((l) => {
                      if (!handlers.find((x) => x.handler.name == l.handler.name)) {
                        handlers.push(l);
                      }
                    });
                  }
                });
                res.statusCode = 200;
                const snsResponse = genSnsPublishBatchResponse(RequestId, Successful, Failed);
                res.end(snsResponse);

                for (const { handler, event: info } of handlers) {
                  try {
                    await handler.invoke({ Records: body.Records }, { kind: "sns", event: info });
                  } catch (error) {
                    console.log(error);
                  }
                }
              } catch (error) {
                handleError(error);
              }
            } else {
              res.statusCode = 400;
              res.end(
                SnsError.genericErrorResponse({
                  RequestId,
                  Message: `Action "${Action}" is currently not supported`,
                })
              );
            }
          },
        },
      ],
    },
  };
};
export default snsPlugin;
