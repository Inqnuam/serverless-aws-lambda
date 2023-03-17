export const getResources = (serverless: any) => {
  let resources = { ddb: {}, kinesis: {}, sns: {}, sqs: {} };
  if (serverless.service.resources?.Resources) {
    resources = Object.entries(serverless.service.resources.Resources)?.reduce(
      (accum, obj: [string, any]) => {
        const [key, value] = obj;

        if (value.Type == "AWS::DynamoDB::Table" && value.Properties) {
          const { TableName, StreamSpecification } = value.Properties;
          if (TableName) {
            accum.ddb[key] = {
              TableName,
            };

            if (StreamSpecification) {
              let StreamEnabled = false;
              if (!("StreamEnabled" in StreamSpecification) || StreamSpecification.StreamEnabled) {
                StreamEnabled = true;
              }
              accum.ddb[key]["StreamEnabled"] = StreamEnabled;

              if (StreamSpecification.StreamViewType) {
                accum.ddb[key]["StreamViewType"] = StreamSpecification.StreamViewType;
              }
            }
          }
        } else if (value.Type == "AWS::Kinesis::Stream" && value.Properties) {
          const { Name, RetentionPeriodHours, ShardCount, StreamModeDetails } = value.Properties;

          accum.kinesis[key] = {
            Name,
            RetentionPeriodHours,
            ShardCount,
            StreamModeDetails,
          };
        } else if (value.Type == "AWS::SNS::Topic" && value.Properties) {
          const { TopicName, ContentBasedDeduplication, DisplayName, FifoTopic } = value.Properties;
          accum.sns[key] = {
            TopicName,
            ContentBasedDeduplication,
            DisplayName,
            FifoTopic,
          };
        } else if (value.Type == "AWS::SQS::Queue" && value.Properties) {
          const {
            QueueName,
            ContentBasedDeduplication,
            DeduplicationScope,
            DelaySeconds,
            FifoQueue,
            FifoThroughputLimit,
            KmsDataKeyReusePeriodSeconds,
            KmsMasterKeyId,
            MaximumMessageSize,
            MessageRetentionPeriod,
            ReceiveMessageWaitTimeSeconds,
            RedriveAllowPolicy,
            RedrivePolicy,
            VisibilityTimeout,
            Tags,
          } = value.Properties;

          accum.sqs[key] = {
            QueueName,
            ContentBasedDeduplication,
            DeduplicationScope,
            DelaySeconds,
            FifoQueue,
            FifoThroughputLimit,
            KmsDataKeyReusePeriodSeconds,
            KmsMasterKeyId,
            MaximumMessageSize,
            MessageRetentionPeriod,
            ReceiveMessageWaitTimeSeconds,
            VisibilityTimeout,
            RedriveAllowPolicy,
            Tags: {},
          };

          if (RedrivePolicy && typeof RedrivePolicy.deadLetterTargetArn == "string") {
            if (RedrivePolicy.deadLetterTargetArn.startsWith("arn:aws:sqs:")) {
              const components = RedrivePolicy.deadLetterTargetArn.split(":");
              const name = components[components.length - 1];

              accum.sqs[key].RedrivePolicy = {
                name,
                deadLetterTargetArn: RedrivePolicy.deadLetterTargetArn,
                maxReceiveCount: !isNaN(RedrivePolicy.maxReceiveCount) ? Number(RedrivePolicy.maxReceiveCount) : 10,
              };
            } else {
              console.log("deadLetterTargetArn must be a string like arn:aws:sqs:...");
            }
          }

          if (Array.isArray(Tags)) {
            Tags.forEach((x) => {
              if (typeof x.Key == "string" && x.Value) {
                accum.sqs[key].Tags[x.Key] = x.Value;
              }
            });
          }
        }

        return accum;
      },
      { ddb: {}, kinesis: {}, sns: {}, sqs: {} } as any
    );
  }
  return resources;
};
