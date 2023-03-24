import { log } from "../utils/colorize";
import { IDestination, parseDestination } from "./index";

export interface IKinesisEvent {
  StreamName: string;
  enabled?: boolean;
  batchSize?: number;
  maximumRetryAttempts?: number;
  startingPosition?: string;
  startingPositionTimestamp?: number;
  parallelizationFactor?: number;
  functionResponseType?: "ReportBatchItemFailures";
  consumer?: boolean | string;
  tumblingWindowInSeconds?: number;
  onFailure?: IDestination;
}

const parseStreamNameFromArnString = (arn: string) => {
  if (arn.split(":")[2] != "kinesis") {
    return;
  }

  return arn.split("/")[1];
};

const parseStreamNameFromArn = (arn: any, Outputs: any, resources: any) => {
  const [key, value] = Object.entries(arn)[0];

  if (key == "Fn::GetAtt" || key == "Ref") {
    const [resourceName] = value as unknown as any[];

    const resource = resources?.[resourceName];
    if (resource) {
      return resource.Name;
    }
  } else if (key == "Fn::Join") {
    const values = value as unknown as any[];
    if (!values.length) {
      return;
    }
    const streamName = values[1][values[1].length - 1];

    if (typeof streamName == "string") {
      return streamName.split("/")[1];
    }
  } else if (key == "Fn::ImportValue" && typeof value == "string") {
    return Outputs?.[value]?.Export?.Name;
  }
};

export const parseKinesis = (event: any, Outputs: any, resources: any) => {
  if (!event || Object.keys(event)[0] !== "stream" || (event.stream.type && event.stream.type != "kinesis")) {
    return;
  }

  let parsedEvent: Partial<IKinesisEvent> = {};

  const val = Object.values(event)[0] as any;
  const valType = typeof val;

  if (valType == "string") {
    const parsedStreamName = parseStreamNameFromArnString(val);
    if (parsedStreamName) {
      parsedEvent.StreamName = parsedStreamName;
      return parsedEvent;
    }
  } else if (valType == "object") {
    if (typeof val.arn == "string") {
      const parsedStreamName = parseStreamNameFromArnString(val.arn);
      if (parsedStreamName) {
        parsedEvent.StreamName = parsedStreamName;
      }
    } else if (val.arn && typeof val.arn == "object") {
      const parsedStreamName = parseStreamNameFromArn(val.arn, Outputs, resources.kinesis);
      if (parsedStreamName) {
        parsedEvent.StreamName = parsedStreamName;
      }
    }

    if (parsedEvent.StreamName) {
      if ("batchSize" in val) {
        parsedEvent.batchSize = val.batchSize;
      }

      if ("maximumRetryAttempts" in val) {
        parsedEvent.maximumRetryAttempts = val.maximumRetryAttempts;
      }

      if ("startingPosition" in val) {
        parsedEvent.startingPosition = val.startingPosition;
      }
      if ("startingPositionTimestamp" in val) {
        parsedEvent.startingPositionTimestamp = val.startingPositionTimestamp;
      }

      if ("enabled" in val) {
        parsedEvent.enabled = val.enabled;
      }

      if ("parallelizationFactor" in val) {
        parsedEvent.parallelizationFactor = val.parallelizationFactor;
      }

      if ("functionResponseType" in val) {
        parsedEvent.functionResponseType = val.functionResponseType;
      }

      if ("consumer" in val) {
        parsedEvent.consumer = val.consumer;
      }

      if ("tumblingWindowInSeconds" in val) {
        parsedEvent.tumblingWindowInSeconds = val.tumblingWindowInSeconds;
      }

      if (val.destinations?.onFailure) {
        const failDest = parseDestination(val.destinations.onFailure, Outputs, resources);
        if (failDest) {
          if (failDest.kind == "lambda") {
            log.YELLOW("Kinesis stream onFailure destination could only be a SNS or SQS service");
          } else {
            parsedEvent.onFailure = failDest;
          }
        }
      }
      return parsedEvent;
    }
  }
};
