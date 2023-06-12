import { KinesisShard } from "./shard";

interface IKinesisStreamProperties {
  Name: string;
  RetentionPeriodHours?: number;
  ShardCount?: number;
}

export class KinesisStream {
  Name: string;
  RetentionPeriodHours: number = 24;
  ShardCount: number = 1;
  #Shards: KinesisShard[] = [];
  constructor(props: IKinesisStreamProperties) {
    this.Name = props.Name;
    if (typeof props.RetentionPeriodHours == "number") {
      this.RetentionPeriodHours = props.RetentionPeriodHours;
    }
    if (typeof props.ShardCount == "number") {
      this.ShardCount = props.ShardCount;
    }
    this.#Shards = new Array(this.ShardCount).fill(new KinesisShard());
  }
}
