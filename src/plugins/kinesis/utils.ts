import { KinesisError } from "./errors";

export const getPartitionKey = ({ PartitionKey }: { PartitionKey?: string }) => {
  const pkType = typeof PartitionKey;
  if (pkType == "string") {
    return PartitionKey;
  }

  if (pkType == "number") {
    throw new KinesisError("SerializationException", 400, "NUMBER_VALUE can not be converted to a String");
  }

  throw new KinesisError("ValidationException", 400, "1 validation error detected: Value null at 'partitionKey' failed to satisfy constraint: Member must not be null");
};

export const getData = ({ Data }: { Data?: string }) => {
  if (typeof Data == "string") {
    return Data;
  }
  throw new KinesisError("ValidationException", 400, "1 validation error detected: Value null at 'data' failed to satisfy constraint: Member must not be null");
};
