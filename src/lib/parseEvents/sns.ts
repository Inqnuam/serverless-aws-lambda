import { log } from "../utils/colorize";
export interface ISnsEvent {
  name: string;
  arn?: string;
  topicName?: string;
  displayName?: string;
  filterScope?: "MessageAttributes" | "MessageBody";
  filter?: any;
  redrivePolicy?: string;
}
const onlySqsAllowed = "SNS redrivePolicy destination could only be a SQS service";

const parseTopicNameFromObject = (resources: any, Outputs: any, obj: any) => {
  const [key, value] = Object.entries(obj)?.[0];

  if (!key || !value) {
    return;
  }

  if (key == "Fn::Join") {
    const values = value as unknown as any[];

    if (!values.length) {
      return;
    }
    const topicName = values[1][values[1].length - 1];

    if (typeof topicName == "string") {
      return topicName.split("/")[1];
    }
  } else if (key == "Fn::GetAtt" || key == "Ref") {
    const [resourceName] = value as unknown as any[];

    const resource = resources?.[resourceName];
    if (resource) {
      return resource.TopicName;
    }
  } else if (key == "Fn::ImportValue" && typeof value == "string") {
    return Outputs?.[value]?.Export?.Name;
  }
};

export const parseSns = (Outputs: any, resources: any, event: any): ISnsEvent | undefined => {
  if (!event.sns) {
    return;
  }
  let sns: any = {};

  if (typeof event.sns == "string") {
    if (event.sns.startsWith("arn:")) {
      const arnComponents = event.sns.split(":");
      sns.name = arnComponents[arnComponents.length - 1];
    } else {
      sns.name = event.sns;
    }
  } else {
    const { arn, topicName, filterPolicyScope, filterPolicy, displayName, redrivePolicy } = event.sns;

    if (typeof arn == "string") {
      const arnComponents = arn.split(":");
      if (arnComponents.length) {
        sns.name = arnComponents[arnComponents.length - 1];
        sns.arn = arn;
      }
    } else if (arn && !Array.isArray(arn) && typeof arn == "object") {
      sns.name = parseTopicNameFromObject(resources?.sns, Outputs, arn);
    }

    if (!sns.name && topicName) {
      sns.name = topicName.split("-")[0];
    }

    if (topicName) {
      sns.topicName = topicName;
    }

    if (filterPolicy) {
      sns.filterScope = filterPolicyScope ?? "MessageAttributes";

      sns.filter = filterPolicy;
    }

    if (displayName) {
      sns.displayName = displayName;
    }

    if (redrivePolicy) {
      const { deadLetterTargetArn, deadLetterTargetRef, deadLetterTargetImport } = redrivePolicy;

      if (typeof deadLetterTargetArn == "string" && deadLetterTargetArn.startsWith("arn:")) {
        const [, , kind, region, accountId, dlq] = deadLetterTargetArn.split(":");
        if (kind == "sqs") {
          sns.redrivePolicy = dlq;
        } else {
          log.YELLOW(onlySqsAllowed);
        }
      } else if (typeof deadLetterTargetRef == "string") {
        if (resources?.sqs?.[deadLetterTargetRef]) {
          const targetRef = resources.sqs[deadLetterTargetRef].QueueName;

          if (targetRef) {
            sns.redrivePolicy = targetRef;
          } else {
            log.YELLOW(`Can not find SNS redrivePolicy for SQS: ${deadLetterTargetRef}`);
          }
        }
      } else if (deadLetterTargetImport && typeof deadLetterTargetImport.arn == "string") {
        const [, , kind, region, accountId, dlq] = deadLetterTargetImport.arn.split(":");

        if (kind == "sqs") {
          sns.redrivePolicy = dlq;
        } else {
          log.YELLOW(onlySqsAllowed);
        }
      }
    }
  }
  if (sns.name) {
    return sns;
  }
};
