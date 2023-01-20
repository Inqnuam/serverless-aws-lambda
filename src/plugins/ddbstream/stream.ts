import { DynamoDBStreamsClient, DescribeStreamCommand, GetShardIteratorCommand, GetRecordsCommand, Shard, GetShardIteratorCommandInput } from "@aws-sdk/client-dynamodb-streams";
import { DynamoDBClient, DescribeTableCommand, UpdateTableCommand, waitUntilTableExists } from "@aws-sdk/client-dynamodb";
import EventEmitter from "events";

export class DynamoStream extends EventEmitter {
  cli: DynamoDBClient;
  streamCli: DynamoDBStreamsClient;
  watchInterval: number;
  watchers: NodeJS.Timeout[] = [];
  constructor(config = { endpoint: "http://localhost:8000", interval: 1 }) {
    super();
    const conf = {
      endpoint: config.endpoint,
      region: "local",
    };
    this.cli = new DynamoDBClient(conf);
    this.streamCli = new DynamoDBStreamsClient(conf);
    this.watchInterval = config.interval;
  }

  async init() {
    await this.#enableStream("Users");

    const LatestStreamArn = await this.getLatestStreamArn("Users");
    const StreamDescription = await this.describeStream(LatestStreamArn!);

    const { Shards, StreamArn } = StreamDescription!;

    if (Shards && StreamArn) {
      Shards.forEach((x, i) => {
        this.watch(x, StreamArn, i);
      });
    }
  }

  async getLatestStreamArn(TableName: string) {
    const { Table } = await this.cli.send(new DescribeTableCommand({ TableName }));

    return Table!.LatestStreamArn;
  }
  async describeStream(StreamArn: string) {
    const cmd = new DescribeStreamCommand({
      StreamArn,
    });

    const { StreamDescription } = await this.streamCli.send(cmd);

    return StreamDescription;
  }
  async getLatestSequenceNumber(Shard: Shard, StreamArn: string) {
    const ShardIterator = await this.getShardInfo(Shard, StreamArn);
    const { Records } = await this.getRecords(ShardIterator);

    if (Records?.length) {
      return Records[Records.length - 1].dynamodb?.SequenceNumber;
    }
  }
  async getShardInfo(Shard: Shard, StreamArn: string, SequenceNumber?: string) {
    let params: GetShardIteratorCommandInput = {
      StreamArn,
      ShardId: Shard.ShardId,
      ShardIteratorType: "AFTER_SEQUENCE_NUMBER",
      SequenceNumber: SequenceNumber ?? Shard.SequenceNumberRange!.EndingSequenceNumber ?? Shard.SequenceNumberRange?.StartingSequenceNumber,
    };
    const shardInfo = new GetShardIteratorCommand(params);

    const res = await this.streamCli.send(shardInfo);
    return res.ShardIterator;
  }
  stop() {
    this.watchers.forEach(clearInterval);
  }
  async #enableStream(TableName: string) {
    await waitUntilTableExists({ client: this.cli, maxWaitTime: 21 }, { TableName });
    const enableStream = new UpdateTableCommand({
      TableName,
      StreamSpecification: {
        StreamEnabled: true,
        StreamViewType: "NEW_AND_OLD_IMAGES",
      },
    });
    try {
      await this.cli.send(enableStream);
    } catch (error) {
      //   console.log(error);
    }
  }

  async getRecords(ShardIterator: string | undefined) {
    const recordCmd = new GetRecordsCommand({
      ShardIterator,
    });
    return this.streamCli.send(recordCmd);
  }
  async watch(Shard: Shard, StreamArn: string, shardIndex: number) {
    const SequenceNumber = await this.getLatestSequenceNumber(Shard, StreamArn);
    const ShardIterator = await this.getShardInfo(Shard, StreamArn, SequenceNumber);
    let iterator = ShardIterator;

    let count = 0;
    const watcher = setInterval(async () => {
      count++;
      console.log("Retry", shardIndex, count);

      const { NextShardIterator, Records } = await this.getRecords(iterator);
      if (NextShardIterator) {
        iterator = NextShardIterator;
      }

      if (Records!.length) {
        console.log(Records?.length);
        this.emit("records", Records);
      }
    }, this.watchInterval * 1000);

    this.watchers.push(watcher);
  }
}
