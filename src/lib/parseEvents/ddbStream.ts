import { log } from "../utils/colorize";
import { parseDestination } from "./index";
import type { IDestination } from "./index";

export interface IDdbEvent {
  TableName: string;
  StreamEnabled: boolean;
  StreamViewType?: string;
  batchSize?: number;
  batchWindow?: number;
  tumblingWindowInSeconds?: number;
  maximumRecordAgeInSeconds?: number;
  maximumRetryAttempts?: number;
  bisectBatchOnFunctionError?: boolean;
  functionResponseType?: string;
  filterPatterns?: any;
  onFailure?: IDestination;
}

enum StreamProps {
  batchSize = 100,
  minRecordAge = 60,
  maxRecordAge = 604800,
  maxBatchWindow = 300,
  maxBatchSize = 10000,
  maxRetryAttempts = 10000,
}
const getTableNameFromResources = (ddbStreamTables: any, Outputs: any, obj: any) => {
  const [key, value] = Object.entries(obj)?.[0];

  if (!key || !value) {
    return;
  }

  if (key == "Fn::GetAtt" || key == "Ref") {
    const [resourceName] = value as unknown as any[];

    const resource = ddbStreamTables?.[resourceName];
    if (resource) {
      return resource.TableName;
    }
  } else if (key == "Fn::ImportValue" && typeof value == "string") {
    return parseDynamoTableNameFromArn(Outputs?.[value]?.Export?.Name);
  } else if (key == "Fn::Join") {
    const values = value as unknown as any[];
    if (!values.length) {
      return;
    }
    const streamName = values[1][values[1].length - 1];

    if (typeof streamName == "string") {
      return streamName.split("/")[1];
    }
  }
};
const parseDynamoTableNameFromArn = (arn: any) => {
  if (typeof arn === "string") {
    const ddb = arn.split(":")?.[2];
    const TableName = arn.split("/")?.[1];

    if (ddb === "dynamodb" && TableName) {
      return TableName;
    }
  }
};

const getStreamTableInfoFromTableName = (ddbStreamTables: any, tableName: string) => {
  const foundInfo = Object.values(ddbStreamTables).find((x: any) => x.TableName == tableName);

  return foundInfo ?? {};
};
export const parseDdbStreamDefinitions = (Outputs: any, resources: any, event: any): IDdbEvent | undefined => {
  if (!event || Object.keys(event)[0] !== "stream" || (event.stream.type && event.stream.type != "dynamodb")) {
    return;
  }

  let parsedEvent: any = {};

  const val = Object.values(event)[0] as any;
  const valType = typeof val;

  if (valType == "string") {
    const parsedTableName = parseDynamoTableNameFromArn(val);
    if (parsedTableName) {
      parsedEvent.TableName = parsedTableName;
    }
  } else if (val && !Array.isArray(val) && valType == "object" && (!("enabled" in val) || val.enabled)) {
    const parsedTableName = parseDynamoTableNameFromArn(val.arn);

    if (parsedTableName) {
      parsedEvent.TableName = parsedTableName;
    } else if (val.arn && typeof val.arn == "object") {
      const parsedTableName = getTableNameFromResources(resources.ddb, Outputs, val.arn);

      if (parsedTableName) {
        parsedEvent.TableName = parsedTableName;
      }
    }

    if (parsedEvent.TableName) {
      if (!isNaN(val.batchSize) && val.batchSize > 0 && val.batchSize <= StreamProps.maxBatchSize) {
        parsedEvent.batchSize = val.batchSize;
      } else {
        parsedEvent.batchSize = StreamProps.batchSize;
      }

      if (!isNaN(val.batchWindow) && val.batchWindow > 0 && val.batchWindow <= StreamProps.maxBatchWindow) {
        parsedEvent.batchWindow = val.batchWindow;
      }

      if (!isNaN(val.maximumRecordAgeInSeconds) && val.maximumRecordAgeInSeconds >= StreamProps.minRecordAge && val.maximumRecordAgeInSeconds <= StreamProps.maxRecordAge) {
        parsedEvent.maximumRecordAgeInSeconds = val.maximumRecordAgeInSeconds;
      }

      if (!isNaN(val.maximumRetryAttempts) && val.maximumRetryAttempts > 0 && val.maximumRetryAttempts <= StreamProps.maxRetryAttempts) {
        parsedEvent.maximumRetryAttempts = val.maximumRetryAttempts;
      }

      if ("bisectBatchOnFunctionError" in val) {
        parsedEvent.bisectBatchOnFunctionError = val.bisectBatchOnFunctionError;
      }

      if (val.functionResponseType) {
        parsedEvent.functionResponseType = val.functionResponseType;
      }
      if (val.filterPatterns) {
        parsedEvent.filterPatterns = val.filterPatterns;
      }

      if (!isNaN(val.tumblingWindowInSeconds)) {
        parsedEvent.tumblingWindowInSeconds = val.tumblingWindowInSeconds;
      }

      if (val.destinations?.onFailure) {
        const failDest = parseDestination(val.destinations.onFailure, Outputs, resources);
        if (failDest) {
          if (failDest.kind == "lambda") {
            log.YELLOW("DynamoDB onFailure destination could only be a SNS or SQS service");
          } else {
            parsedEvent.onFailure = failDest;
          }
        }
      }
    }
  }

  if (parsedEvent.TableName) {
    const streamInfo = getStreamTableInfoFromTableName(resources.ddb, parsedEvent.TableName);

    // @ts-ignore
    parsedEvent = { ...parsedEvent, ...streamInfo };

    if (!("StreamEnabled" in parsedEvent)) {
      parsedEvent.StreamEnabled = true;
    }
    return parsedEvent;
  }
};
