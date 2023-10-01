import { randomUUID } from "crypto";
import { SqsError } from "./errors";
import { parseAttributes } from "./parser";
import { md5, invalidAttribValue, getBatchItemFailures, createBatch } from "./utils";
import { verifyMessageAttributes, verifyMessageBody } from "./verifyRequest";

const sleep = (sec: number) => new Promise((resolve) => setTimeout(resolve, sec * 1000));

interface Subscriber {
  name: string;
  invoke: Function;
  event: any;
}
interface IRedrivePolicy {
  name: string;
  deadLetterTargetArn: string;
  maxReceiveCount: number;
}
interface IQueueConfig {
  QueueName: string;
  ContentBasedDeduplication?: boolean;
  DeduplicationScope?: "messageGroup" | "queue";
  DelaySeconds?: number;
  FifoQueue?: boolean;
  FifoThroughputLimit?: "perQueue" | "perMessageGroupId";
  KmsDataKeyReusePeriodSeconds?: number;
  KmsMasterKeyId?: string;
  MaximumMessageSize?: number;
  MessageRetentionPeriod?: number;
  ReceiveMessageWaitTimeSeconds?: number;
  VisibilityTimeout?: number;
  RedriveAllowPolicy?: any;
  RedrivePolicy?: IRedrivePolicy;
  subscribers: Subscriber[];
  Tags: { [key: string]: string };
}

export class Queue implements IQueueConfig {
  QueueName: string;
  ContentBasedDeduplication?: boolean = false;
  DeduplicationScope?: "messageGroup" | "queue";
  DelaySeconds: number = 0;
  FifoQueue?: boolean = false;
  FifoThroughputLimit?: "perQueue" | "perMessageGroupId";
  KmsDataKeyReusePeriodSeconds?: number;
  KmsMasterKeyId?: string;
  MaximumMessageSize: number = 262144;
  MessageRetentionPeriod: number = 345600;
  ReceiveMessageWaitTimeSeconds: number = 0;
  VisibilityTimeout: number = 30;
  RedriveAllowPolicy?: any;
  RedrivePolicy?: IRedrivePolicy;
  CreatedTimestamp: number = Date.now();
  LastModifiedTimestamp: number = Date.now();
  Tags: { [key: string]: string } = {};
  subscribers: Subscriber[];
  #records: any[] = [];
  #delayed: number = 0;
  #deleted: number = 0;
  purgeInProgress: boolean = false;
  static REGION = "us-east-1";
  static PORT = 0;
  static Queues: Queue[] = [];
  constructor({
    QueueName,
    ContentBasedDeduplication,
    DeduplicationScope,
    DelaySeconds,
    FifoQueue,
    FifoThroughputLimit,
    KmsDataKeyReusePeriodSeconds,
    KmsMasterKeyId,
    MaximumMessageSize,
    MessageRetentionPeriod,
    ReceiveMessageWaitTimeSeconds,
    VisibilityTimeout,
    RedriveAllowPolicy,
    RedrivePolicy,
    subscribers,
    Tags,
  }: IQueueConfig) {
    this.QueueName = QueueName;
    this.ContentBasedDeduplication = ContentBasedDeduplication;
    this.FifoQueue = FifoQueue;
    this.FifoThroughputLimit = FifoThroughputLimit;
    this.KmsDataKeyReusePeriodSeconds = KmsDataKeyReusePeriodSeconds;
    this.KmsMasterKeyId = KmsMasterKeyId;
    this.RedriveAllowPolicy = RedriveAllowPolicy;
    this.RedrivePolicy = RedrivePolicy;
    this.subscribers = subscribers;
    this.Tags = Tags;
    if (DeduplicationScope) {
      this.DeduplicationScope = DeduplicationScope;
    }
    if (DelaySeconds) {
      this.DelaySeconds = DelaySeconds;
    }

    if (MaximumMessageSize) {
      this.MaximumMessageSize = MaximumMessageSize;
    }

    if (MessageRetentionPeriod) {
      this.MessageRetentionPeriod = MessageRetentionPeriod;
    }
    if (ReceiveMessageWaitTimeSeconds) {
      this.ReceiveMessageWaitTimeSeconds = ReceiveMessageWaitTimeSeconds;
    }

    if (VisibilityTimeout) {
      this.VisibilityTimeout = VisibilityTimeout;
    }
  }

  #moveToDlq = (msg: any) => {
    const dlq = Queue.Queues.find((x) => x.QueueName == this.RedrivePolicy?.name);

    if (dlq) {
      dlq.newRecord(msg);
    }
  };
  #getRetriableMessages = (records: any[]) => {
    const recs: any[] = [];

    records.forEach((x) => {
      if (Number(x.record.attributes.ApproximateReceiveCount) < this.RedrivePolicy!.maxReceiveCount) {
        recs.push(x);
        this.#toggleVisibility(x);
      } else {
        this.#moveToDlq(x.record);
      }
    });

    return recs;
  };
  #retry = async (subscriber: Subscriber, records: any[]) => {
    let recs: any[] = records.slice();

    const setRecs = this.RedrivePolicy
      ? this.#getRetriableMessages
      : (records: any[]) => {
          const recs = records.filter((x) => this.#records.find((r) => r.record.messageId == x.record.messageId));
          recs.forEach((x) => this.#toggleVisibility(x));
          return recs;
        };

    while (recs.length) {
      let success: string[] = [];
      let failures: any[] = [];
      try {
        const res = await subscriber.invoke({ Records: recs.map((x: any) => x.record) }, { kind: "sqs", event: subscriber.event });

        if (subscriber.event.functionResponseType == "ReportBatchItemFailures") {
          const result = getBatchItemFailures(recs, res);
          if (result) {
            if (result.failures.length) {
              failures = result.failures;
            }
            success = result.success;
          } else {
            success = recs.map((x) => x.record.messageId);
          }
        } else {
          success = recs.map((x) => x.record.messageId);
        }
      } catch (error) {
        failures = recs;
      } finally {
        success.forEach((x) => this.#clearRecord(x));
      }

      await sleep(11);
      recs = setRecs(failures);
    }
  };
  #callLambda = async (subscriber: Subscriber, records: any[]) => {
    if (!records.length) {
      return;
    }
    let success: string[] = [];
    let failures: any[] = [];
    try {
      const res = await subscriber.invoke({ Records: records.map((x: any) => x.record) }, { kind: "sqs", event: subscriber.event });

      if (subscriber.event.functionResponseType == "ReportBatchItemFailures") {
        const result = getBatchItemFailures(records, res);
        if (result) {
          if (result.failures.length) {
            failures = result.failures;
          }
          success = result.success;
        } else {
          success = records.map((x) => x.record.messageId);
        }
      } else {
        success = records.map((x) => x.record.messageId);
      }
    } catch (error) {
      // TOTAL failure
      failures = records;
    } finally {
      success.forEach((x) => this.#clearRecord(x));
      if (failures.length) {
        await this.#retry(subscriber, failures);
      }
    }
  };
  #clearRecord = (messageId: string) => {
    const foundIndex = this.#records.findIndex((x) => x.record.messageId == messageId);
    if (foundIndex != -1) {
      clearTimeout(this.#records[foundIndex].tmRetention);
      clearTimeout(this.#records[foundIndex].tm);
      this.#records.splice(foundIndex, 1);
      this.#deleted++;
      return true;
    }
  };
  #toggleVisibility = (x: any, customTimeout?: number, keepReceiptHandle?: boolean) => {
    if (!x) {
      return;
    }

    let timeout = this.VisibilityTimeout * 1000;

    if (customTimeout) {
      timeout = customTimeout * 1000;
    }

    x.record.attributes.ApproximateReceiveCount = String(Number(x.record.attributes.ApproximateReceiveCount) + 1);

    if (x.record.attributes.ApproximateReceiveCount == "1") {
      x.record.attributes.ApproximateFirstReceiveTimestamp = Date.now().toString();
    }

    x.visible = false;
    if (!keepReceiptHandle) {
      x.record.receiptHandle = Queue.receiptHandle();
    }

    if (x.tm) {
      clearTimeout(x.tm);
    }

    x.tm = setTimeout(() => {
      if (x) {
        x.visible = true;
      }
    }, timeout);

    x.tmStart = Date.now();
  };
  notify = () => {
    if (!this.#records.length) {
      return;
    }
    this.subscribers?.forEach(async (subscriber) => {
      if (subscriber.event.maximumBatchingWindow) {
        await sleep(subscriber.event.maximumBatchingWindow);
      }

      const records = this.#filterRecords(subscriber.event.filterPatterns);

      if (records.length) {
        records.forEach((x) => this.#toggleVisibility(x));

        const batches = createBatch(records, isNaN(subscriber.event.batchSize) ? 10 : subscriber.event.batchSize);

        batches.forEach(async (batch) => {
          await this.#callLambda(subscriber, batch);
        });
      }
    });
  };
  setRecord = (request: any) => {
    const delay = !isNaN(request.DelaySeconds) ? Number(request.DelaySeconds) : undefined;

    if (delay) {
      const delayIsInvalid = invalidAttribValue.DelaySeconds(delay);
      if (delayIsInvalid) {
        throw new SqsError({ Code: "InvalidParameterValue", Message: delayIsInvalid });
      }
    }

    const msg = Queue.createRecord(request, this.QueueName);
    const record = this.newRecord(msg, delay);

    return record.record;
  };
  newRecord = (msg: any, delay?: number) => {
    const record: any = { visible: true, record: msg };
    this.#delayed++;
    setTimeout(() => {
      this.#records.push(record);
      this.notify();
      this.#delayed--;
    }, (delay ?? this.DelaySeconds) * 1000);

    record.tmRetention = setTimeout(() => {
      if (this.RedrivePolicy) {
        this.#moveToDlq(record);
      }

      this.#clearRecord(record.record.messageId);
    }, this.MessageRetentionPeriod * 1000);

    return record;
  };
  static receiptHandle() {
    return Buffer.from(randomUUID() + randomUUID() + randomUUID(), "utf-8")
      .toString("base64")
      .replace(/=/g, "");
  }
  static createRecord({ MessageBody, MessageAttribute, MessageSystemAttribute }: any, QueueName: string) {
    verifyMessageBody(MessageBody);

    const record: any = {
      messageId: randomUUID(),
      receiptHandle: "",
      body: MessageBody,
      attributes: {
        ApproximateReceiveCount: "0",
        AWSTraceHeader: "",
        SentTimestamp: Date.now().toString(),
        SenderId: "ABCDEFGHI1JKLMNOPQ23R",
        ApproximateFirstReceiveTimestamp: "",
      },
      messageAttributes: {},
      md5OfMessageAttributes: "",
      md5OfBody: md5(MessageBody),
      eventSource: "aws:sqs",
      eventSourceARN: `arn:aws:sqs:${Queue.REGION}:000000000000:${QueueName}`,
      awsRegion: Queue.REGION,
    };

    if (MessageAttribute) {
      verifyMessageAttributes(MessageAttribute);
      const { messageAttributes, md5OfMessageAttributes } = parseAttributes(MessageAttribute);
      record.messageAttributes = messageAttributes;
      record.md5OfMessageAttributes = md5OfMessageAttributes;
    } else {
      delete record.messageAttributes;
      delete record.md5OfMessageAttributes;
    }

    if (MessageSystemAttribute) {
      verifyMessageAttributes(MessageSystemAttribute, "system");

      record.attributes.AWSTraceHeader = MessageSystemAttribute.AWSTraceHeader.StringValue;
    } else {
      delete record.attributes.AWSTraceHeader;
    }

    return record;
  }

  static #numericCompare = (operator: string, value: number, compareTo: number): boolean => {
    switch (operator) {
      case "=":
        return value == compareTo;
      case ">":
        return value > compareTo;
      case "<":
        return value < compareTo;
      case ">=":
        return value >= compareTo;
      case "<=":
        return value >= compareTo;
      default:
        return false;
    }
  };
  static #expressionOperators: {
    [key: string]: (record: any, key: string, operatorValue: any) => boolean;
  } = {
    exists: (record: any, key: string, operatorValue: any) => {
      if (operatorValue === true) {
        return key in record;
      } else if (operatorValue === false) {
        return !(key in record);
      } else {
        throw new Error("stream filter 'exists' value must be 'true' or 'false'");
      }
    },
    prefix: (record: any, key: string, operatorValue: any) => {
      if (typeof operatorValue !== "string") {
        throw new Error("SQS filter 'prefix' value must be typeof 'string'");
      }

      const val = typeof record[key] == "string" ? record[key] : undefined;

      if (val) {
        return val.startsWith(operatorValue);
      }
      return false;
    },
    numeric: (record: any, key: string, operatorValue: any) => {
      if (!Array.isArray(operatorValue) || ![2, 4].includes(operatorValue.length)) {
        throw new Error("SQS filter 'numeric' value must be an array with 2 or 4 items");
      }

      if (!(key in record)) {
        return false;
      }

      const andResult: boolean[] = [];
      const [comparator, value] = operatorValue;
      andResult.push(Queue.#numericCompare(comparator, record[key], value));

      if (operatorValue.length == 4) {
        const [, , comparator, value] = operatorValue;
        andResult.push(Queue.#numericCompare(comparator, record[key], value));
      }

      return andResult.every((x) => x === true);
    },
    "anything-but": (record: any, key: string, operatorValue: any) => {
      if (!Array.isArray(operatorValue) || !operatorValue.every((x) => typeof x == "string")) {
        throw new Error("SQS filter 'anything-but' value must be an array of string");
      }
      const val = typeof record[key] == "string" ? record[key] : undefined;
      if (val) {
        return !operatorValue.includes(val);
      }

      return false;
    },
  };

  static #filter = (record: any, key: string, operator: any) => {
    const opType = typeof operator;
    if (opType == "string" || opType === null) {
      return record[key] == operator;
    } else if (opType == "object" && !Array.isArray(operator)) {
      const andConditions: boolean[] = [];

      for (const [opName, opValue] of Object.entries(operator)) {
        if (opName in Queue.#expressionOperators) {
          andConditions.push(Queue.#expressionOperators[opName](record, key, opValue));
        }
      }
      return andConditions.every((x) => x === true);
    }

    return false;
  };

  static #filterObject = (pattern: any, record: any, isTopLevel?: boolean) => {
    const filterResult: boolean[] = [];

    for (const [key, operator] of Object.entries(pattern)) {
      let childFilterResult: boolean[] = [];

      if (Array.isArray(operator)) {
        childFilterResult = operator.map((x) => Queue.#filter(record, key, x));
      } else if (record[key]) {
        let value = record[key];

        if (isTopLevel && key == "body") {
          try {
            value = JSON.parse(value);
          } catch (error) {}
        }

        childFilterResult = [Queue.#filterObject(operator, value)];
      }

      filterResult.push(childFilterResult.some((x) => x === true));
    }

    return filterResult.every((x) => x === true);
  };
  #filterRecords = (filterPatterns: any) => {
    if (Array.isArray(filterPatterns)) {
      const records = this.#records.map((x) => {
        if (!x.visible) {
          return null;
        }
        const filterResult = filterPatterns.map((p) => Queue.#filterObject(p, x.record, true));
        const hasPassedFilters = filterResult.find((x) => x === true);
        if (hasPassedFilters) {
          return x;
        } else {
          this.#clearRecord(x.record.messageId);
          return null;
        }
      });

      return records.filter(Boolean);
    } else {
      return this.#records.filter((x) => x.visible);
    }
  };

  purge = (cb?: Function) => {
    if (this.purgeInProgress) {
      return false;
    } else {
      this.purgeInProgress = true;
      setTimeout(() => {
        this.#records.forEach((x) => this.#clearRecord(x.record.messageId));
        cb?.();
        this.purgeInProgress = false;
      }, 60 * 1000);
      return true;
    }
  };

  #collectedRecords = (waitTime: number, maxMsgCount: number, VisibilityTimeout: number): Promise<any[]> => {
    return new Promise((resolve) => {
      const reqUuid = randomUUID();
      let elapsedTime = waitTime;
      const collectedRecords: any = [];

      const interval = setInterval(() => {
        for (const x of this.#records) {
          if (x.visible || x.reqUuid == reqUuid) {
            if (x.visible) {
              x.reqUuid = reqUuid;
            }

            this.#toggleVisibility(x, VisibilityTimeout);
            // shallow copy to keep track of receive count and other system attributes
            const recordCopy = { ...x };
            recordCopy.record = { ...recordCopy.record };
            recordCopy.record.attributes = { ...recordCopy.record.attributes };
            collectedRecords.push(recordCopy);
          }

          if (collectedRecords.length == maxMsgCount) {
            break;
          }
        }
        elapsedTime -= 1;
        if (elapsedTime <= 0 || collectedRecords.length == maxMsgCount) {
          clearInterval(interval);
          resolve(collectedRecords.map((x: any) => x.record));
        }
      }, 1.1 * 100);
    });
  };
  receive = async ({ VisibilityTimeout, WaitTimeSeconds, MaxNumberOfMessages }: any) => {
    const waitTime = WaitTimeSeconds ?? this.ReceiveMessageWaitTimeSeconds;
    const maxMsgCount = MaxNumberOfMessages ?? 1; // AWS SQS default value

    if (VisibilityTimeout) {
      const visibilityIsInvalid = invalidAttribValue.VisibilityTimeout(VisibilityTimeout);
      if (visibilityIsInvalid) {
        throw new SqsError({ Code: "InvalidParameterValue", Message: visibilityIsInvalid, SenderFault: true });
      }
    }

    const maxCountIsInvalid = invalidAttribValue.MaxNumberOfMessages(maxMsgCount);

    if (maxCountIsInvalid) {
      throw new SqsError({ Code: "InvalidParameterValue", Message: maxCountIsInvalid, SenderFault: true });
    }

    const collectedRecords = await this.#collectedRecords(waitTime, Number(maxMsgCount), Number(VisibilityTimeout));
    return collectedRecords;
  };
  delete = (receiptHandle: string) => {
    const foundMsg = this.#records.findIndex((x) => x.record.receiptHandle == receiptHandle);

    if (foundMsg != -1) {
      clearTimeout(this.#records[foundMsg].tmRetention);
      this.#records.splice(foundMsg, 1);
      this.#deleted++;
      return true;
    } else {
      return false;
    }
  };
  changeVisibility = (receiptHandle: string, VisibilityTimeout: string) => {
    const foundMsg = this.#records.find((x) => x.record.receiptHandle == receiptHandle);

    if (foundMsg) {
      let timeout = Number(VisibilityTimeout);

      if (!foundMsg.visible) {
        const elapsedTime = Math.ceil((Date.now() - foundMsg.tmStart) / 1000);
        timeout = timeout + elapsedTime;
      }

      this.#toggleVisibility(foundMsg, timeout, true);

      return true;
    }

    return false;
  };

  static listQueues = ({ prefix, limit, token }: { prefix?: string; limit?: number; token?: string }) => {
    let previousStartPosition = 0;
    if (token) {
      if (!limit) {
        throw new SqsError({
          Code: "InvalidParameterValue",
          Message: "MaxResults is a mandatory parameter when you provide a value for NextToken.",
        });
      }

      try {
        const parsedToken = JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
        previousStartPosition = parsedToken.previousStartPosition;

        if (parsedToken.previousPrefix && (parsedToken.previousPrefix != prefix || !prefix)) {
          throw new SqsError({
            Code: "InvalidParameterValue",
            Message: "Invalid NextToken value. If you are passing in NextToken, you must not change the other request parameters.",
          });
        }
      } catch (error) {
        if (error instanceof SqsError) {
          throw error;
        } else {
          throw new SqsError({
            Code: "InvalidParameterValue",
            Message: "Invalid NextToken value.",
          });
        }
      }
    }

    let list = typeof prefix == "string" ? Queue.Queues.filter((x) => x.QueueName.startsWith(prefix)) : Queue.Queues;

    let nextToken: any;
    if (limit) {
      if (limit > 1000 || limit < 1) {
        throw new SqsError({
          Code: "InvalidParameterValue",
          Message: "Value for parameter MaxResults is invalid. Reason: MaxResults must be an integer between 1 and 1000.",
        });
      }

      const listLength = list.length;
      list = list.slice().splice(previousStartPosition, limit);

      if (previousStartPosition + limit < listLength) {
        nextToken = {
          previousStartPosition: previousStartPosition + limit,
          previousPrefix: prefix,
          date: Date.now(),
        };
      }
    }

    if (list.length > 1000) {
      list = list.slice().splice(0, 1000);

      if (nextToken) {
        nextToken.previousStartPosition = nextToken.previousStartPosition - limit! + 1000;
      } else {
        nextToken = {
          previousStartPosition: previousStartPosition + 1000,
          previousPrefix: prefix,
          date: Date.now(),
        };
      }
    }

    if (nextToken) {
      nextToken = Buffer.from(JSON.stringify(nextToken)).toString("base64");
    }
    return {
      list: list.map((x) => `http://localhost:${Queue.PORT}/123456789012/${x.QueueName}`),
      nextToken,
    };
  };

  setTags = (tags: { Key: string; Value: string }[]) => {
    const hasInvalidValue = tags.find((x) => !x.Key || !x.Value || x.Value.startsWith("[object"));
    if (hasInvalidValue) {
      throw new SqsError({
        Code: "InvalidParameterValue",
        Message: "Tag values may only contain unicode letters, digits, whitespace, or one of these symbols: _ . : / = + - @'",
      });
    }

    tags.forEach((x) => {
      this.Tags[x.Key] = x.Value;
    });
  };

  removeTags = (tags: string[]) => {
    if (!Array.isArray(tags) || tags.some((x) => x.startsWith("[object"))) {
      throw new SqsError({
        Code: "InvalidParameterValue",
        Message: "TagKey must be an array of string",
      });
    }
    tags.forEach((x) => {
      delete this.Tags[x];
    });
  };
}
