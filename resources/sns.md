## AWS Local SNS

Supports AWS SNS `Publish` and `PublishBatch` actions locally.  
Subscribed functions are invoked automatically after a publish action.

### Installation

Import the plugin inside your defineConfig.

```js
// config.js
import { defineConfig } from "serverless-aws-lambda/defineConfig";
import { snsPlugin } from "serverless-aws-lambda/sns";

export default defineConfig({
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

### Example of supported SNS declarations

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

\+ `Fn::GetAtt`, `Ref`, `Fn::Join`, `Fn::ImportValue` variants.

---

## Publish a Notification

### with aws-sdk SNS Client

```js
// src/insertUser.js
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const localSnsServer = `http://localhost:${process.env.LOCAL_PORT}/@sns`;

const params = process.env.IS_LOCAL
  ? {
      region: "eu-west-1",
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

### with AWS CLI

```bash
aws sns --region eu-west-1 --endpoint http://localhost:9999/@sns publish --topic-arn "arn:aws:sns:eu-west-3:123456789012:InsertUserTopic" --message "Hello World"
```

Handle the Insert user Notification

```js
// src/myAwsomeLambda.js

export default async (snsEvent) => {
  console.log(snsEvent);
};
```
