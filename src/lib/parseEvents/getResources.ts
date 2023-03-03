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
          const { TopicName } = value.Properties;
          accum.sns[key] = {
            TopicName,
          };
        } else if (value.Type == "AWS::SQS::Queue" && value.Properties) {
          const { QueueName } = value.Properties;
          accum.sqs[key] = {
            QueueName,
          };
        }

        return accum;
      },
      { ddb: {}, kinesis: {}, sns: {}, sqs: {} } as any
    );
  }
  return resources;
};
