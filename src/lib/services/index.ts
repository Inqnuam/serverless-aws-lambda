import { type SQSClientConfig, type SQSClient } from "@aws-sdk/client-sqs";

export class AwsServices {
  static sqs: SQSClient;
  static async setSqsClient(config: SQSClientConfig) {
    try {
      const { SQSClient } = await import("@aws-sdk/client-sqs");
      this.sqs = new SQSClient(config);
    } catch (error) {}
  }
}
