## AWS Local SNS

Supports AWS SNS `Publish` and `PublishBatch` actions locally.  
Subscribed functions are invoked automatically after a publish action.

### Installation

Import the plugin inside your defineConfig.

```js
// config.js
const { defineConfig } = require("serverless-aws-lambda/defineConfig");
const { snsPlugin } = require("serverless-aws-lambda/sns");

module.exports = defineConfig({
  plugins: [snsPlugin()],
});
```

---

### Usage example

Subscribe to a SNS Topic with serverless declaration.

```yaml
# serverless.yml

functions:
  insertUser:
    handler: src/insertUser.default
    events:
      - httpApi:
          path: "/users"
          method: post
  myAwsomeLambda:
    handler: src/myAwsomeLambda.default
    events:
      - sns: InsertUserTopic
```

Publish a Notification with aws-sdk SNS Client when a new user is added into a database

```js
// src/insertUser.js
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const localSnsServer = `http://localhost:${process.env.LOCAL_PORT}/@sns`;

const params = process.env.IS_LOCAL
  ? {
      region: "local",
      endpoint: localSnsServer, // <- important
    }
  : {};
const client = new SNSClient(params);

export default async (event) => {
  // some app logic ...
  try {
    const user = JSON.parse(event.body);
    const newUser = await UsersTable.add(user);

    const snsMsg = {
      user: {
        id: newUser.id,
        status: "UNVERIFIED",
      },
    };

    const cmd = new PublishCommand({
      TopicArn: "arn:aws:sns:eu-west-3:123456789012:InsertUserTopic",
      Message: JSON.stringify({
        default: JSON.stringify(snsMsg),
      }),
      MessageStructure: "json",
      MessageAttributes: {
        Hello: {
          DataType: "String",
          StringValue: "world",
        },
      },
    });

    await client.send(cmd);
    return {
      statusCode: 201,
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify(error),
    };
  }
};
```

Handle the Insert user Notification

```js
// src/myAwsomeLambda.js

export default async (snsEvent) => {
  console.log(snsEvent);
};
```

---

### Supported SNS declarations

```yaml
- sns: InsertUserTopic
```

```yaml
- sns: arn:aws:sns:us-east-1:00000000000:InsertUserTopic
```

```yaml
- sns:
    arn: arn:aws:sns:us-east-1:00000000000:InsertUserTopic
```

```yaml
- sns:
    topicName: InsertUserTopic-account-1-us-east-1
```

```yaml
- sns:
    arn: arn:aws:sns:us-east-1:00000000000:InsertUserTopic
    filterPolicyScope: MessageBody
    filterPolicy:
      pet:
        - dog
        - cat
```
