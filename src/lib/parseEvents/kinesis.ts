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

    const resource = resources[resourceName];
    if (resource) {
      return resource.Name;
    }
  } else if (key == "Fn::Join") {
    const values = value as unknown as any[];
    const streamName = values[1][values[1].length - 1];

    if (typeof streamName == "string") {
      return streamName.split("/")[1];
    }
  } else if (key == "Fn::ImportValue" && typeof value == "string") {
    return Outputs?.[value]?.Export?.Name;
  }
};

export const parseKinesis = (event: any, Outputs: any, resources: any) => {
  if (!event || Object.keys(event)[0] !== "stream") {
    return;
  }

  let parsedEvent: any = {};

  const val = Object.values(event)[0] as any;
  const valType = typeof val;

  if (valType == "string") {
    const parsedStreamName = parseStreamNameFromArnString(val);
    if (parsedStreamName) {
      parsedEvent.StreamName = parsedStreamName;
    }
    return parsedEvent;
  } else if (valType == "object") {
    if (typeof val.arn == "string") {
      const parsedStreamName = parseStreamNameFromArnString(val.arn);
      if (parsedStreamName) {
        parsedEvent.StreamName = parsedStreamName;
      }
    } else if (val.arn && typeof val.arn == "object") {
      const parsedStreamName = parseStreamNameFromArn(val.arn, Outputs, resources);
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
      return parsedEvent;
    }
  }
};
