export interface ISqs {
  name: string;
  arn?: string;
  batchSize?: number;
  maximumBatchingWindow?: number;
  filterPatterns?: any;
  enabled?: boolean;
  functionResponseType?: ["ReportBatchItemFailures"];
}
const parseQueueNameFromObject = (resources: any, Outputs: any, obj: any) => {
  const [key, value] = Object.entries(obj)?.[0];

  if (!key || !value) {
    return;
  }

  if (key == "Fn::Join") {
    const values = value as unknown as any[];

    if (!values.length) {
      return;
    }
    const queueName = values[1][values[1].length - 1];

    if (typeof queueName == "string") {
      return queueName.split("/")[1];
    }
  } else if (key == "Fn::GetAtt" || key == "Ref") {
    const [resourceName] = value as unknown as any[];

    const resource = resources?.[resourceName];
    if (resource) {
      return resource.QueueName;
    }
  } else if (key == "Fn::ImportValue" && typeof value == "string") {
    return Outputs?.[value]?.Export?.Name;
  }
};

export const parseSqs = (Outputs: any, resources: any, event: any): ISqs | undefined => {
  if (!event.sqs) {
    return;
  }
  let sqs: any = {};

  if (typeof event.sqs == "string") {
    sqs.enabled = true;

    if (event.sqs.startsWith("arn:")) {
      const arnComponents = event.sqs.split(":");
      sqs.name = arnComponents[arnComponents.length - 1];
    } else {
      sqs.name = event.sqs;
    }
  } else {
    const { arn, filterPatterns, batchSize, maximumBatchingWindow, functionResponseType, enabled } = event.sqs;

    if (typeof arn == "string") {
      const arnComponents = arn.split(":");
      if (arnComponents.length) {
        sqs.name = arnComponents[arnComponents.length - 1];
        sqs.arn = arn;
      }
    } else if (arn && !Array.isArray(arn) && typeof arn == "object") {
      sqs.name = parseQueueNameFromObject(resources?.sqs, Outputs, arn);
    }

    if (filterPatterns) {
      sqs.filterPatterns = filterPatterns;
    }

    if (batchSize) {
      sqs.batchSize = batchSize;
    }

    if (maximumBatchingWindow) {
      sqs.maximumBatchingWindow = maximumBatchingWindow;
    }
    if (functionResponseType == "ReportBatchItemFailures" || (Array.isArray(functionResponseType) && functionResponseType[0] == "ReportBatchItemFailures")) {
      sqs.functionResponseType = ["ReportBatchItemFailures"];
    }

    if (typeof enabled == "boolean") {
      sqs.enabled = enabled;
    } else {
      sqs.enabled = true;
    }
  }
  if (sqs.name) {
    return sqs;
  }
};
