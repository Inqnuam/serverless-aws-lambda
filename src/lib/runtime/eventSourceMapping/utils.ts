import { log } from "../../utils/colorize";
import type { ILambdaMock } from "../rapidApi";
import { EventSourceMapping } from "./base";
import { SQS_DEFAULT_BATCH_SIZE, SQS_DEFAULT_MaximumBatchingWindowInSeconds, SqsEventSourceMapping } from "./sqs";

export const initEventSourceMapping = async (lambdas: ILambdaMock[]) => {
  for (const l of lambdas) {
    for (const sqs of l.sqs) {
      let EventSourceArn = sqs.arn;

      if (!EventSourceArn) {
        if (sqs.name) {
          EventSourceArn = `arn:aws:sqs:us-east-1:123456789012:${sqs.name}`;
        } else {
          continue;
        }
      }

      let Filters: { Pattern: string }[] | undefined = undefined;

      if (Array.isArray(sqs.filterPatterns)) {
        Filters = [];
        for (const f of sqs.filterPatterns) {
          if (isJsObject(f)) {
            Filters.push({ Pattern: JSON.stringify(f) });
          }
        }
        if (!Filters.length) {
          Filters = undefined;
        }
      }

      const e = new SqsEventSourceMapping(
        {
          BatchSize: typeof sqs.batchSize == "number" ? sqs.batchSize : SQS_DEFAULT_BATCH_SIZE,
          Enabled: sqs.enabled!,
          EventSourceArn,
          FunctionName: l.name,
          FunctionResponseTypes: sqs.functionResponseType,
          FilterCriteria: Filters ? { Filters } : undefined,
          MaximumBatchingWindowInSeconds: typeof sqs.maximumBatchingWindow == "number" ? sqs.maximumBatchingWindow : SQS_DEFAULT_MaximumBatchingWindowInSeconds,
        },
        lambdas,
        sqs
      );

      EventSourceMapping.SOURCES.push(e);
      if (e.config.Enabled) {
        try {
          await e.pool();
        } catch (error) {
          log.RED(`Failed to start EventSourceMapping ${e.config.EventSourceArn}\nPlease verify provided SQS Client Config validity.`);
          console.error(error);
        }
      }
    }
  }
};

const alphaNumAndHyphens = /(-|\w+)/g;
const isValidMessageId = (id: string) => {
  return id.length < 81 && id.replace(alphaNumAndHyphens, "") == "";
};
export const getBatchItemFailures = (records: any[], response?: any) => {
  if (
    typeof response === undefined ||
    response === null ||
    (typeof response == "object" && (response.batchItemFailures === null || (Array.isArray(response.batchItemFailures) && !response.batchItemFailures.length)))
  ) {
    // considered as complete success
    return records.map((x) => x.receiptHandle);
  }

  const success: string[] = [];

  if (typeof response == "object" && Array.isArray(response.batchItemFailures)) {
    if (response.batchItemFailures.some((x: any) => !x.itemIdentifier || !isValidMessageId(x.itemIdentifier) || !records.find((r) => r.messageId == x.itemIdentifier))) {
      throw new Error("ReportBatchItemFailures: complete failure.");
    } else {
      records.forEach((r) => {
        const foundFailed = response.batchItemFailures.find((x: any) => x.itemIdentifier == r.messageId);

        if (!foundFailed) {
          success.push(r.receiptHandle);
        }
      });

      return success;
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

export const isJsObject = (value: any) => Object.prototype.toString.call(value) == "[object Object]";
