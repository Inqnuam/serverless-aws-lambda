import type { ILambda } from "../../defineConfig";
import type { QueueAttributes } from "./types";

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

const convertToCreateQueueCommandInput = (resource: Record<string, any>) => {
  const {
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
    Tags,
    RedrivePolicy,
  } = resource;

  const createQueue: { QueueName: string; tags?: Record<string, any>; Attributes?: Record<string, any> } = { QueueName };

  if (Tags && Object.keys(Tags).length) {
    createQueue.tags = Tags;
  }

  const attribs: Record<string, any> = {};

  if (typeof ContentBasedDeduplication != "undefined") {
    attribs.ContentBasedDeduplication = ContentBasedDeduplication;
  }

  if (typeof DeduplicationScope != "undefined") {
    attribs.DeduplicationScope = DeduplicationScope;
  }

  if (typeof DelaySeconds != "undefined") {
    attribs.DelaySeconds = DelaySeconds;
  }

  if (typeof FifoQueue != "undefined") {
    attribs.FifoQueue = FifoQueue;
  }

  if (typeof FifoThroughputLimit != "undefined") {
    attribs.FifoThroughputLimit = FifoThroughputLimit;
  }

  if (typeof KmsDataKeyReusePeriodSeconds != "undefined") {
    attribs.KmsDataKeyReusePeriodSeconds = KmsDataKeyReusePeriodSeconds;
  }

  if (typeof KmsMasterKeyId != "undefined") {
    attribs.KmsMasterKeyId = KmsMasterKeyId;
  }

  if (typeof MaximumMessageSize != "undefined") {
    attribs.MaximumMessageSize = MaximumMessageSize;
  }

  if (typeof MessageRetentionPeriod != "undefined") {
    attribs.MessageRetentionPeriod = MessageRetentionPeriod;
  }

  if (typeof ReceiveMessageWaitTimeSeconds != "undefined") {
    attribs.ReceiveMessageWaitTimeSeconds = ReceiveMessageWaitTimeSeconds;
  }

  if (typeof VisibilityTimeout != "undefined") {
    attribs.VisibilityTimeout = VisibilityTimeout;
  }

  if (typeof RedrivePolicy != "undefined") {
    attribs.RedrivePolicy = JSON.stringify({ deadLetterTargetArn: RedrivePolicy.deadLetterTargetArn, maxReceiveCount: RedrivePolicy.maxReceiveCount });
  }

  if (QueueName.endsWith(".fifo")) {
    attribs.FifoQueue = "true";
  }

  if (Object.keys(attribs).length) {
    createQueue.Attributes = attribs;
  }

  return createQueue;
};

export const getQueues = (resources: any, lambdas: ILambda[], attributes?: QueueAttributes) => {
  const sqsResources: any[] = Object.values(resources);

  const addQueue = (QueueName: string) => {
    const foundIndex = sqsResources.findIndex((x: any) => x.QueueName == QueueName);
    if (foundIndex == -1) {
      const sqsResource: any = {
        QueueName,
      };

      sqsResources.push(sqsResource);
      return true;
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
      addQueue(sqs.name);
    });
  });

  sqsResources.forEach((x) => {
    if (x.RedrivePolicy) {
      addQueue(x.RedrivePolicy.name);
    }
  });

  return sqsResources.map((x: any) => convertToCreateQueueCommandInput(mergeAttributes(x, attributes)));
};
