export const parseSns = (event: any) => {
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
    const { arn, topicName, filterPolicyScope, filterPolicy, displayName } = event.sns;

    if (arn) {
      const arnComponents = arn.split(":");
      sns.name = arnComponents[arnComponents.length - 1];
      sns.arn = arn;
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
  }
  if (Object.keys(sns).length) {
    return sns;
  }
};
