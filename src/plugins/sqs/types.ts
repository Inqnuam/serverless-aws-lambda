interface Attributes {
  DelaySeconds?: number;
  MessageRetentionPeriod?: number;
  ReceiveMessageWaitTimeSeconds?: number;
  VisibilityTimeout?: number;
}

export interface QueueAttributes {
  default?: Attributes;
  override?: Attributes;
}
