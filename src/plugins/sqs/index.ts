import type { SlsAwsLambdaPlugin } from "../../defineConfig";
import type { QueueAttributes } from "./types";
import { randomUUID } from "crypto";
import { getQueues, findDuplicatedIds, validateIds, verifyAttributes } from "./utils";
import { parseSqsPublishBody, parseSqsPublishBatchBody, simpleBodyParser, parseDottedBody } from "./parser";
import {
  SendMessageResponse,
  SendMessageBatchResponse,
  PurgeQueueResponse,
  PurgeQueueErrorResponse,
  queueNotFound,
  ChangeMessageVisibilityResponse,
  ChangeMessageVisibilityError,
  ReceiveMessageResponse,
  ChangeMessageVisibilityBatchResponse,
  EmptyBatchRequest,
  TooManyEntriesInBatchRequest,
  BatchEntryIdsNotDistinct,
  InvalidBatchEntryId,
  DeleteMessageResponse,
  DeleteMessageBatchResponse,
  ListQueuesResponse,
  ReceiptHandleIsInvalid,
  ListQueueTagsResponse,
  DeleteQueueResponse,
  TagQueueResponse,
  UntagQueueResponse,
} from "./responses";
import { Queue } from "./queue";
import { SqsError } from "./errors";

export const sqsPlugin = (attributes?: QueueAttributes): SlsAwsLambdaPlugin => {
  const deletingQueues = new Set();
  return {
    name: "sqs-plugin",
    onInit: function () {
      if (!this.isDeploying && !this.isPackaging) {
        verifyAttributes(attributes);
        Queue.Queues = getQueues(this.resources.sqs, this.lambdas, attributes);
        const region = this.serverless.service.provider.region;
        if (region) {
          Queue.REGION = region;
        }
      }
    },
    buildCallback(result, isRebuild) {
      if (isRebuild) {
        try {
          Queue.Queues.forEach((x) => x.notify());
        } catch (error) {}
      }
    },
    offline: {
      onReady(port, ip) {
        Queue.PORT = port;
      },
      request: [
        {
          method: "POST",
          filter: "/@sqs",
          callback: async function (req, res) {
            let data = Buffer.alloc(0);
            const RequestId = (req.headers["amz-sdk-invocation-id"] ?? randomUUID()) as string;

            const handleError = (error: any) => {
              res.statusCode = 400;

              if (error instanceof SqsError) {
                res.end(error.toXml(RequestId));
              } else {
                res.end(SqsError.genericErrorResponse({ RequestId, Message: error.toString?.() ?? "Unknown error" }));
              }
            };
            req.on("data", (chunk) => {
              data += chunk;
            });

            const encodedBody: string[] = await new Promise((resolve) => {
              req.on("end", async () => {
                const dataAsString = data.toString();

                resolve(decodeURIComponent(dataAsString)?.split("&").filter(Boolean));
              });
            });

            const Action = encodedBody.find((x) => x.startsWith("Action="))?.split("=")[1];

            res.setHeader("x-amzn-requestid", RequestId);
            res.setHeader("Content-Type", "text/xml");

            if (Action == "ListQueues") {
              try {
                const body = simpleBodyParser(encodedBody);
                const { list, nextToken } = Queue.listQueues({ limit: Number(body.MaxResults), prefix: body.QueueNamePrefix, token: body.NextToken });
                res.end(ListQueuesResponse(RequestId, list, nextToken));
              } catch (error: any) {
                handleError(error);
              }
            } else {
              let QueueUrl = encodedBody.find((x) => x.startsWith("QueueUrl"))?.split("=")[1];
              try {
                const url = new URL(QueueUrl!);
                const paths = url.pathname.split("/").filter(Boolean);
                QueueUrl = paths[paths.length - 1];
              } catch (error) {}

              const foundQueue = Queue.Queues.find((x) => x.QueueName == QueueUrl);
              if (!QueueUrl || !foundQueue || deletingQueues.has(foundQueue.QueueName)) {
                res.statusCode = 400;
                return res.end(queueNotFound(RequestId));
              }
              if (Action == "SendMessage") {
                try {
                  const body = parseSqsPublishBody(encodedBody);
                  console.log(`\x1b[35mSQS: ${foundQueue.QueueName}\x1b[0m`);
                  const record = foundQueue.setRecord(body);
                  res.statusCode = 200;
                  res.end(SendMessageResponse(record, RequestId));
                } catch (error: any) {
                  handleError(error);
                }
              } else if (Action == "SendMessageBatch") {
                try {
                  const { Entries } = parseSqsPublishBatchBody(encodedBody);

                  if (!Entries.length) {
                    res.statusCode = 400;
                    res.end(EmptyBatchRequest(RequestId));
                  } else if (Entries.length > 10) {
                    res.statusCode = 400;
                    res.end(TooManyEntriesInBatchRequest(RequestId, Entries.length));
                  } else if (!validateIds(Entries)) {
                    res.statusCode = 400;
                    res.end(InvalidBatchEntryId(RequestId));
                  } else {
                    const foundDuplicatedId = findDuplicatedIds(Entries);
                    if (foundDuplicatedId) {
                      res.statusCode = 400;
                      res.end(BatchEntryIdsNotDistinct(RequestId, foundDuplicatedId));
                    } else {
                      const success: any[] = [];
                      const failures: any[] = [];
                      console.log(`\x1b[35mSQS: ${foundQueue.QueueName}\x1b[0m`);
                      Entries.forEach((msg: any) => {
                        try {
                          const record = foundQueue.setRecord(msg);

                          let result: any = {
                            Id: msg.Id,
                            MessageId: record.messageId,
                            MD5OfMessageBody: record.md5OfBody,
                          };

                          if (record.md5OfMessageAttributes) {
                            result.MD5OfMessageAttributes = record.md5OfMessageAttributes;
                          }
                          if (record.attributes.AWSTraceHeader) {
                            // NOTE: as currently only "AWSTraceHeader" is allowed by AWS, we de not calculate md5 every time
                            result.MD5OfMessageSystemAttributes = "5f48eef650c1d0207456969c85af2fdd";
                          }
                          success.push(result);
                        } catch (error: any) {
                          let result: any = {
                            Id: msg.Id,
                            Message: error.message,
                          };

                          if (error.Code) {
                            result.Code = error.Code;
                          }

                          if ("SenderFault" in error) {
                            result.SenderFault = `${error.SenderFault}`;
                          }

                          failures.push(result);
                        }
                      });
                      res.end(SendMessageBatchResponse(success, failures, RequestId));
                    }
                  }
                } catch (error: any) {
                  handleError(error);
                }
              } else if (Action == "PurgeQueue") {
                if (foundQueue.purge()) {
                  res.end(PurgeQueueResponse(RequestId));
                } else {
                  res.statusCode = 403;
                  res.end(PurgeQueueErrorResponse(RequestId, QueueUrl));
                }
              } else if (Action == "ReceiveMessage") {
                try {
                  const body = simpleBodyParser(encodedBody);
                  const { VisibilityTimeout, WaitTimeSeconds, MaxNumberOfMessages, AttributeNames, MessageAttributeNames } = body;
                  const response = await foundQueue.receive({ VisibilityTimeout, WaitTimeSeconds, MaxNumberOfMessages });
                  return res.end(ReceiveMessageResponse(RequestId, response, AttributeNames, MessageAttributeNames));
                } catch (error: any) {
                  handleError(error);
                }
              } else if (Action == "ChangeMessageVisibility") {
                const body = simpleBodyParser(encodedBody);

                if (foundQueue.changeVisibility(body.ReceiptHandle, body.VisibilityTimeout)) {
                  res.end(ChangeMessageVisibilityResponse(RequestId));
                } else {
                  res.end(ChangeMessageVisibilityError(RequestId, body.ReceiptHandle));
                }
              } else if (Action == "ChangeMessageVisibilityBatch") {
                const body = parseDottedBody(encodedBody);

                if (!body.ChangeMessageVisibilityBatchRequestEntry.length) {
                  res.statusCode = 400;
                  res.end(EmptyBatchRequest(RequestId));
                } else if (body.ChangeMessageVisibilityBatchRequestEntry.length > 10) {
                  res.statusCode = 400;
                  res.end(TooManyEntriesInBatchRequest(RequestId, body.ChangeMessageVisibilityBatchRequestEntry.length));
                } else if (!validateIds(body.ChangeMessageVisibilityBatchRequestEntry)) {
                  res.statusCode = 400;
                  res.end(InvalidBatchEntryId(RequestId));
                } else {
                  const foundDuplicatedId = findDuplicatedIds(body.ChangeMessageVisibilityBatchRequestEntry);
                  if (foundDuplicatedId) {
                    res.statusCode = 400;
                    res.end(BatchEntryIdsNotDistinct(RequestId, foundDuplicatedId));
                  } else {
                    const success: any[] = [];
                    const failures: any[] = [];
                    body.ChangeMessageVisibilityBatchRequestEntry.forEach((x: any) => {
                      if (foundQueue.changeVisibility(x.ReceiptHandle, x.VisibilityTimeout)) {
                        success.push(x.Id);
                      } else {
                        failures.push({
                          id: x.Id,
                          receiptHandle: x.ReceiptHandle,
                        });
                      }
                    });

                    res.end(ChangeMessageVisibilityBatchResponse(success, failures, RequestId));
                  }
                }
              } else if (Action == "DeleteMessage") {
                const body = simpleBodyParser(encodedBody);
                if (foundQueue.delete(body.ReceiptHandle)) {
                  res.end(DeleteMessageResponse(RequestId));
                } else {
                  res.statusCode = 404;
                  res.end(ReceiptHandleIsInvalid(RequestId, body.ReceiptHandle));
                }
              } else if (Action == "DeleteMessageBatch") {
                const body = parseDottedBody(encodedBody);

                if (!body.DeleteMessageBatchRequestEntry.length) {
                  res.statusCode = 400;
                  res.end(EmptyBatchRequest(RequestId));
                } else if (body.DeleteMessageBatchRequestEntry.length > 10) {
                  res.statusCode = 400;
                  res.end(TooManyEntriesInBatchRequest(RequestId, body.DeleteMessageBatchRequestEntry.length));
                } else if (!validateIds(body.DeleteMessageBatchRequestEntry)) {
                  res.statusCode = 400;
                  res.end(InvalidBatchEntryId(RequestId));
                } else {
                  const foundDuplicatedId = findDuplicatedIds(body.DeleteMessageBatchRequestEntry);
                  if (foundDuplicatedId) {
                    res.statusCode = 400;
                    res.end(BatchEntryIdsNotDistinct(RequestId, foundDuplicatedId));
                  } else {
                    const success: any[] = [];
                    const failures: any[] = [];
                    body.DeleteMessageBatchRequestEntry.forEach((x: any) => {
                      if (foundQueue.delete(x.ReceiptHandle)) {
                        success.push(x.Id);
                      } else {
                        failures.push({
                          id: x.Id,
                          receiptHandle: x.ReceiptHandle,
                        });
                      }
                    });

                    res.end(DeleteMessageBatchResponse(success, failures, RequestId));
                  }
                }
              } else if (Action == "ListQueueTags") {
                res.end(ListQueueTagsResponse(RequestId, foundQueue.Tags));
              } else if (Action == "TagQueue") {
                const body = parseDottedBody(encodedBody);

                try {
                  foundQueue.setTags(body.Tag);
                  res.end(TagQueueResponse(RequestId));
                } catch (error: any) {
                  handleError(error);
                }
              } else if (Action == "UntagQueue") {
                const body = parseDottedBody(encodedBody);

                try {
                  foundQueue.removeTags(body.TagKey);
                  res.end(UntagQueueResponse(RequestId));
                } catch (error) {
                  handleError(error);
                }
              } else if (Action == "DeleteQueue") {
                const cb = () => {
                  const foundIndex = Queue.Queues.findIndex((x) => x.QueueName == foundQueue.QueueName);

                  if (foundIndex != -1) {
                    Queue.Queues.splice(foundIndex, 1);
                  }

                  deletingQueues.delete(foundQueue.QueueName);
                };
                foundQueue.purge(cb);
                deletingQueues.add(foundQueue.QueueName);

                res.end(DeleteQueueResponse(RequestId));
              } else {
                res.statusCode = 400;
                res.end(
                  SqsError.genericErrorResponse({
                    RequestId,
                    Message: `Action "${Action}" is currently not supported`,
                  })
                );
              }
            }
          },
        },
      ],
    },
  };
};

export default sqsPlugin;
