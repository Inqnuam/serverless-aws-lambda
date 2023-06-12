import { getPartitionKey, getData } from "../utils";

export class PutRecord {
  StreamName: string;
  PartitionKey: string;
  Data: string;
  constructor(StreamName: string, body: any) {
    this.StreamName = StreamName;
    this.PartitionKey = getPartitionKey(body) as string;
    this.Data = getData(body);
  }
}
