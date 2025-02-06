import { EventSourceMapping, type IEventSourceMappingConfig } from "./base";
import { ReceiveMessageCommand, DeleteMessageBatchCommand, GetQueueAttributesCommand, GetQueueUrlCommand } from "@aws-sdk/client-sqs";
import { createBatch, getBatchItemFailures } from "./utils";
import { AwsServices } from "../../services";
import type { ILambdaMock } from "../rapidApi";

export const SQS_DEFAULT_BATCH_SIZE = 10;
export const SQS_DEFAULT_MaximumBatchingWindowInSeconds = 0;

const poolSqs = (QueueUrl: string, MaxNumberOfMessages: number) => {
  return AwsServices.sqs.send(new ReceiveMessageCommand({ QueueUrl, AttributeNames: ["All"], MessageAttributeNames: ["All"], MaxNumberOfMessages }));
};

const getQueueUrl = (QueueName: string) => {
  return AwsServices.sqs.send(new GetQueueUrlCommand({ QueueName }));
};
const getQueueAttributes = (QueueUrl: string) => {
  return AwsServices.sqs.send(new GetQueueAttributesCommand({ QueueUrl, AttributeNames: ["All"] }));
};

const deleteSqsMessages = async (QueueUrl: string, ReceiptHandles: string[]) => {
  for (const batch of createBatch(ReceiptHandles, 10) as string[][]) {
    if (!batch.length) {
      continue;
    }

    const Entries = batch.map((x, i) => {
      return {
        Id: `id-${i + 1}`,
        ReceiptHandle: x,
      };
    });

    try {
      await AwsServices.sqs.send(new DeleteMessageBatchCommand({ QueueUrl, Entries }));
    } catch (error) {}
  }
};

const createMessageAttributes = (MessageAttributes?: Record<string, any>) => {
  if (!MessageAttributes) {
    return {};
  }

  const attribs: Record<string, any> = {};

  for (const [key, value] of Object.entries(MessageAttributes)) {
    attribs[key] = {};

    const { StringValue, BinaryValue, DataType } = value;

    if (DataType.startsWith("B")) {
      attribs[key].binaryValue = BinaryValue;
    } else {
      attribs[key].stringValue = StringValue;
    }

    attribs[key].stringListValues = [];
    attribs[key].binaryListValues = [];
    attribs[key].dataType = DataType;
  }

  return attribs;
};

const createSqsEvent = (x: any, EventSourceArn: string) => {
  const { MessageId, Body, MD5OfBody, ReceiptHandle, Attributes, MessageAttributes, MD5OfMessageAttributes } = x;

  const sqsEvent: Record<string, any> = {
    messageId: MessageId,
    receiptHandle: ReceiptHandle,
    body: Body,
    attributes: Attributes,
    messageAttributes: createMessageAttributes(MessageAttributes),
  };

  if (MD5OfMessageAttributes) {
    sqsEvent.md5OfMessageAttributes = MD5OfMessageAttributes;
  }

  sqsEvent.md5OfBody = MD5OfBody;

  sqsEvent.eventSource = "aws:sqs";
  sqsEvent.eventSourceARN = EventSourceArn;
  sqsEvent.awsRegion = EventSourceArn.split(":")[3];

  return sqsEvent;
};

const createSqsEventRecords = (messages: any[], EventSourceArn: string) => messages.map((x) => createSqsEvent(x, EventSourceArn));

class SqsBatch {
  available: boolean = true;
  #messages: any[] = [];
  #isInvoking: boolean = false;
  constructor(
    private MaximumBatchingWindowInSeconds: number,
    private BatchSize: number,
    private lambdaName: string,
    private QueueUrl: string,
    private ReportBatchItemFailures: boolean,
    private legacyDefinition: any,
    private handlers: ILambdaMock[]
  ) {}

  #start() {
    setTimeout(async () => {
      this.available = false;

      if (!this.#isInvoking) {
        await this.#invokeFunction();
      }
    }, this.MaximumBatchingWindowInSeconds * 1000);
  }

  async setRecord(message: any) {
    if (!this.#messages.length) {
      this.#start();
    }

    this.#messages.push(message);

    if (this.#messages.length == this.BatchSize || !this.available) {
      this.available = false;
      await this.#invokeFunction();
    }
  }
  async #invokeFunction() {
    this.#isInvoking = true;

    let messagesToDelete = this.#messages.map((x) => x.receiptHandle);
    try {
      const lambda = this.handlers.find((x) => x.name == this.lambdaName || x.outName == this.lambdaName)!;
      const res = await lambda.invoke({ Records: this.#messages }, { kind: "sqs", event: this.legacyDefinition });

      if (this.ReportBatchItemFailures) {
        // @ts-ignore
        messagesToDelete = getBatchItemFailures(this.#messages, res);
      }

      await deleteSqsMessages(this.QueueUrl, messagesToDelete);
    } catch (error) {}
  }
}

export class SqsEventSourceMapping extends EventSourceMapping {
  #batchs: SqsBatch[] = [];
  QueueName: string = "";
  QueueUrl: string = "";
  #pooler?: NodeJS.Timeout;
  #ReportBatchItemFailures: boolean;
  constructor(
    public config: IEventSourceMappingConfig,
    public handlers: ILambdaMock[],
    public legacyDefinition: any
  ) {
    super(config, legacyDefinition);

    const comp = this.config.EventSourceArn.split(":");
    this.QueueName = comp[comp.length - 1];

    this.#ReportBatchItemFailures = this.config.FunctionResponseTypes?.[0] == "ReportBatchItemFailures";
  }

  #getBatch() {
    const availableBatch = this.#batchs.find((x) => x.available);

    if (availableBatch) {
      return availableBatch;
    }

    const batch = new SqsBatch(
      this.config.MaximumBatchingWindowInSeconds!,
      this.config.BatchSize,
      this.config.FunctionName,
      this.QueueUrl,
      this.#ReportBatchItemFailures,
      this.legacyDefinition,
      this.handlers
    );
    this.#batchs.push(batch);

    return batch;
  }

  async #collectMessages(Messages: any[]) {
    for (const msg of Messages) {
      await this.#getBatch().setRecord(msg);
    }
  }

  async pool() {
    if (!AwsServices.sqs) {
      return;
    }

    const { QueueUrl } = await getQueueUrl(this.QueueName);
    this.QueueUrl = QueueUrl!;
    await this.enable();
  }

  #poolInterval = 1500;

  cleanBatchs() {
    for (let i = 0; i < this.#batchs.length; i++) {
      const b = this.#batchs[i];

      if (!b.available) {
        this.#batchs.splice(i, 1);
      }
    }
  }
  async #setPoolInterval() {
    let emptyCount = 0;

    let interval = 2000;

    const getAttributesAndSetPooInterval = async () => {
      try {
        const { Attributes } = await getQueueAttributes(this.QueueUrl);
        const ApproximateNumberOfMessages = Number(Attributes!.ApproximateNumberOfMessages);

        if (!ApproximateNumberOfMessages) {
          emptyCount++;

          if (this.#poolInterval <= 20000) {
            this.#poolInterval += 200;
          }

          if (emptyCount == 5) {
            interval = 2000;
          }
        } else {
          emptyCount = 0;
          interval = 400;
          const lastPoolInterval = this.#poolInterval;
          this.#poolInterval = 350;

          if (lastPoolInterval >= 1600) {
            await this.#launchMessageDog(true);
          }
        }
      } catch (error) {
        interval = 2000;
      }

      this.cleanBatchs();
      this.#pooler = setTimeout(getAttributesAndSetPooInterval, interval);
    };

    await getAttributesAndSetPooInterval();
  }

  #messageDogTimer?: NodeJS.Timeout;
  async #launchMessageDog(reset?: boolean) {
    if (reset) {
      clearTimeout(this.#messageDogTimer);
    }

    const messageDog = async () => {
      if (!this.config.Enabled) {
        if (this.State == "Disabling") {
          this.State = "Disabled";
        }
        return;
      }

      try {
        const { Messages } = await poolSqs(this.QueueUrl, this.config.BatchSize <= 10 ? this.config.BatchSize : 10);

        if (Messages) {
          const messages = createSqsEventRecords(Messages, this.config.EventSourceArn);
          const Records = await this.#filterRecords(messages);
          await this.#collectMessages(Records);
        }
      } catch (error) {}

      this.#messageDogTimer = setTimeout(messageDog, this.#poolInterval);
    };

    await messageDog();
  }
  async enable() {
    this.State = "Enabling";

    try {
      await this.#setPoolInterval();
      this.config.Enabled = true;
      this.State = "Enabled";
      await this.#launchMessageDog();
    } catch (error) {
      console.error(error);
    }
  }

  disable() {
    this.config.Enabled = false;
    clearTimeout(this.#pooler);
    this.State = "Disabling";
  }

  async #filterRecords(records: any[]) {
    const messages = records.map((x) => {
      const msg = { ...x };

      try {
        msg.body = JSON.parse(msg.body);
      } catch (error) {}

      return msg;
    });

    const [Records, UnprocessableRecords] = this.filterRecords(messages);

    await deleteSqsMessages(
      this.QueueUrl,
      UnprocessableRecords.map((x) => x.receiptHandle)
    );

    const processableRecords = [];

    for (const record of Records) {
      processableRecords.push(...records.filter((x) => x.messageId == record.messageId));
    }

    return processableRecords;
  }
}
