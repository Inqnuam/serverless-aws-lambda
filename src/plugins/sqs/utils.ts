import type { BinaryLike } from "crypto";
import type { ILambda } from "../../defineConfig";
import type { QueueAttributes } from "./types";
import { Queue } from "./queue";
import { createHash } from "crypto";
import { SqsError } from "./errors";
export const md5 = (contents: string | BinaryLike): string => {
  return createHash("md5").update(contents).digest("hex");
};

const mergeAttributes = (queue: any, attributes?: QueueAttributes) => {
  if (!attributes) {
    return queue;
  }

  if (attributes.override) {
    Object.entries(attributes.override).forEach((x) => {
      const [k, v] = x;

      if (k in queue) {
        queue[k] = v;
      }
    });
  }

  if (attributes.default) {
    Object.entries(attributes.default).forEach((x) => {
      const [k, v] = x;

      if (queue[k] == undefined) {
        queue[k] = v;
      }
    });
  }
  return queue;
};

export const getQueues = (resources: any, lambdas: ILambda[], attributes?: QueueAttributes): Queue[] => {
  const sqsResources: any[] = Object.values(resources);

  const addQueue = (QueueName: string, subscriber?: any) => {
    const foundIndex = sqsResources.findIndex((x: any) => x.QueueName == QueueName);
    if (foundIndex == -1) {
      const sqsResource: any = {
        QueueName,
        subscribers: [],
      };
      if (subscriber) {
        sqsResource.subscribers.push(subscriber);
      }
      sqsResources.push(sqsResource);
      return true;
    } else if (subscriber) {
      if (Array.isArray(sqsResources[foundIndex].subscribers)) {
        sqsResources[foundIndex].subscribers.push(subscriber);
      } else {
        sqsResources[foundIndex].subscribers = [subscriber];
      }
    }
  };
  lambdas.forEach((l) => {
    l.sns.forEach((sns) => {
      if (typeof sns.redrivePolicy == "string") {
        addQueue(sns.redrivePolicy);
      }
    });

    l.ddb.forEach((ddb) => {
      if (ddb.onFailure?.kind == "sqs") {
        addQueue(ddb.onFailure!.name);
      }
    });

    l.kinesis.forEach((kinesis) => {
      if (kinesis.onFailure?.kind == "sqs") {
        addQueue(kinesis.onFailure!.name);
      }
    });

    if (l.onError?.kind == "sqs") {
      addQueue(l.onError.name);
    }
    if (l.onFailure?.kind == "sqs") {
      addQueue(l.onFailure.name);
    }
    if (l.onSuccess?.kind == "sqs") {
      addQueue(l.onSuccess.name);
    }

    l.sqs.forEach((sqs) => {
      const subscriber = {
        name: l.outName,
        invoke: l.invoke,
        event: sqs,
      };

      addQueue(sqs.name, subscriber);
    });
  });

  sqsResources.forEach((x) => {
    if (x.RedrivePolicy) {
      addQueue(x.RedrivePolicy.name);
    }
  });

  return sqsResources.map((x: any) => new Queue(mergeAttributes(x, attributes)));
};

export const findDuplicatedIds = (entries: any[]) => {
  const ids = entries.map((x) => {
    const entry = {
      id: x.Id,
      total: entries.filter((e) => e.Id == x.Id).length,
    };
    return entry;
  });

  return ids.find((x) => x.total > 1)?.id;
};

const alphaNumAndHyphens = /(-|\w+)/g;
const isValidMessageId = (id: string) => {
  return id.length < 81 && id.replace(alphaNumAndHyphens, "") == "";
};
export const validateIds = (entries: any[]) => {
  const foundMissingIdIndex = entries.findIndex((x) => !("Id" in x));

  if (foundMissingIdIndex != -1) {
    throw new SqsError({ Code: "MissingParameter", Message: `The request must contain the parameter SendMessageBatchRequestEntry.${foundMissingIdIndex + 1}.Id.` });
  }

  if (!entries.every((x) => isValidMessageId(x.Id))) {
    throw new SqsError({
      Code: "AWS.SimpleQueueService.InvalidBatchEntryId",
      Message: `A batch entry id can only contain alphanumeric characters, hyphens and underscores. It can be at most 80 letters long.`,
    });
  }
};

const invalidAttribValue: { [key: string]: Function } = {
  DelaySeconds: (x: number) => {
    if (isNaN(x) || Number(x) < 0 || Number(x) > 900) {
      return `Value ${x} for parameter DelaySeconds is invalid. Reason: DelaySeconds must be >= 0 and <= 900.`;
    }
  },
  MessageRetentionPeriod: (x: number) => {
    if (isNaN(x) || Number(x) < 60 || Number(x) > 1209600) {
      return "MessageRetentionPeriod must be a number between 60 and 1209600.";
    }
  },
  ReceiveMessageWaitTimeSeconds: (x: number) => {
    if (isNaN(x) || Number(x) < 0 || Number(x) > 20) {
      return "ReceiveMessageWaitTimeSeconds must be a number between 0 and 20.";
    }
  },
  VisibilityTimeout: (x: number) => {
    if (isNaN(x) || Number(x) < 0 || Number(x) > 43200) {
      return `Value ${x} for parameter VisibilityTimeout is invalid. Reason: Must be between 0 and 43200, if provided.`;
    }
  },
  MaxNumberOfMessages: (x: number) => {
    if (isNaN(x) || Number(x) < 1 || Number(x) > 10) {
      return `Value ${x} for parameter MaxNumberOfMessages is invalid. Reason: Must be between 1 and 10, if provided.`;
    }
  },
};

export const verifyAttributes = (attributes?: QueueAttributes) => {
  if (!attributes) {
    return;
  }
  const unsupported: string[] = [];
  const invalidValues: string[] = [];

  let entries: any[] = [];
  if (attributes.default) {
    entries = Object.entries(attributes.default);
  }

  if (attributes.override) {
    entries = entries.concat(Object.entries(attributes.override));
  }

  entries.forEach((x) => {
    const [k, v] = x;

    const func = invalidAttribValue[k];
    if (func) {
      const isInvalid = func(v);

      if (isInvalid) {
        invalidValues.push(isInvalid);
      }
    } else {
      unsupported.push(k);
    }
  });

  if (unsupported.length + invalidValues.length != 0) {
    let errMsg = "";
    const unsupportedMsg = unsupported.map((x) => `'${x}'`).join(", ");

    if (unsupportedMsg.length) {
      errMsg = `Currently unsupported attributes: ${unsupportedMsg}\n`;
    }

    invalidValues.forEach((x) => {
      errMsg += `${x}\n`;
    });

    throw new Error(errMsg);
  }
};
export { invalidAttribValue };

export const getBatchItemFailures = (records: any[], response?: any) => {
  if (
    typeof response === undefined ||
    response === null ||
    (typeof response == "object" && (response.batchItemFailures === null || (Array.isArray(response.batchItemFailures) && !response.batchItemFailures.length)))
  ) {
    // considered as complete success
    return;
  }

  if (typeof response == "object" && Array.isArray(response.batchItemFailures)) {
    if (response.batchItemFailures.some((x: any) => !x.itemIdentifier || !isValidMessageId(x.itemIdentifier) || !records.find((r) => r.record.messageId == x.itemIdentifier))) {
      throw new Error("ReportBatchItemFailures: complete failure.");
    } else {
      // return failed messages

      const success: string[] = [];
      const failures: any = [];
      records.forEach((r) => {
        const foundFailed = response.batchItemFailures.find((x: any) => x.itemIdentifier == r.record.messageId);

        if (foundFailed) {
          failures.push(r);
        } else {
          success.push(r.messageId);
        }
      });

      return {
        success,
        failures,
      };
    }
  }
};

export const createBatch = (records: any, batchSize: number) => {
  const batches = [];

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    batches.push(batch);
  }

  return batches;
};
