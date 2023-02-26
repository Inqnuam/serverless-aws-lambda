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

    const resource = resources[resourceName];
    if (resource) {
      return resource.TopicName;
    }
  } else if (key == "Fn::ImportValue" && typeof value == "string") {
    return Outputs?.[value]?.Export?.Name;
  }
};

export const parseSns = (resources: any, Outputs: any, event: any) => {
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
      sns.name = arnComponents[arnComponents.length - 1];
      sns.arn = arn;
    } else if (arn && !Array.isArray(arn) && typeof arn == "object") {
      sns.name = parseTopicNameFromObject(resources, Outputs, arn);
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
      console.log("redrivePolicy", redrivePolicy);
      // TODO: parse
    }
  }
  if (Object.keys(sns).length) {
    return sns;
  }
};
