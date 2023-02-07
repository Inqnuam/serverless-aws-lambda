export const getDynamoStreamTables = (serverless: any) => {
  let ddbStreamTables = [];
  if (serverless.service.resources?.Resources) {
    ddbStreamTables = Object.entries(serverless.service.resources.Resources)?.reduce((accum, obj: [string, any]) => {
      const [key, value] = obj;

      if (value.Type == "AWS::DynamoDB::Table") {
        const { TableName, StreamSpecification } = value.Properties;
        if (TableName) {
          accum[key] = {
            TableName,
          };

          if (StreamSpecification) {
            let StreamEnabled = false;
            if (!("StreamEnabled" in StreamSpecification) || StreamSpecification.StreamEnabled) {
              StreamEnabled = true;
            }
            accum[key]["StreamEnabled"] = StreamEnabled;

            if (StreamSpecification.StreamViewType) {
              accum[key]["StreamViewType"] = StreamSpecification.StreamViewType;
            }
          }
        }
      }

      return accum;
    }, {} as any);
  }
  return ddbStreamTables;
};

const getTableNameFromResources = (ddbStreamTables: any, serverless: any, obj: any) => {
  const [key, value] = Object.entries(obj)?.[0];

  if (!key || !value) {
    return;
  }

  if (key == "Fn::GetAtt" || key == "Ref") {
    const [resourceName] = value as unknown as any[];

    const resource = ddbStreamTables[resourceName];
    if (resource) {
      return resource.TableName;
    }
  } else if (key == "Fn::ImportValue" && typeof value == "string") {
    return parseDynamoTableNameFromArn(serverless.service.resources?.Outputs?.[value]?.Export?.Name);
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

  if (foundInfo) {
    return foundInfo;
  }
};
export const parseDdbStreamDefinitions = (serverless: any, ddbStreamTables: any, event: any) => {
  if (!event || Object.keys(event)[0] !== "stream") {
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
      const parsedTableName = getTableNameFromResources(ddbStreamTables, serverless, val.arn);

      if (parsedTableName) {
        parsedEvent.TableName = parsedTableName;
      }
    }

    if (parsedEvent.TableName) {
      parsedEvent.batchSize = val.batchSize ?? 100;

      if (val.functionResponseType) {
        parsedEvent.functionResponseType = val.functionResponseType;
      }
      if (val.filterPatterns) {
        parsedEvent.filterPatterns = val.filterPatterns;
      }

      if (val.destinations?.onFailure) {
        parsedEvent.onFailure = val.destinations.onFailure;
      }
    }
  }

  if (parsedEvent.TableName) {
    const streamInfo = getStreamTableInfoFromTableName(ddbStreamTables, parsedEvent.TableName);

    parsedEvent = { ...parsedEvent, ...streamInfo };

    if (!("StreamEnabled" in parsedEvent)) {
      parsedEvent.StreamEnabled = true;
    }
    return parsedEvent;
  }
};
