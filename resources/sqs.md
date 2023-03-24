## AWS Local SQS

### Description

Plugin for serverless-aws-lambda to trigger locally your sqs event defined lambdas automatically.  
Local Queues are created based on your serverless.yml.  
To define default and/or override Queue attributes see [Plugin configs](../src/plugins/sqs/types.ts).  
Currently FIFO queues are considered as Standart.

### Installation

Import the plugin inside your defineConfig.

```js
// config.js
const { defineConfig } = require("serverless-aws-lambda/defineConfig");
const { sqsPlugin } = require("serverless-aws-lambda/sqs");

module.exports = defineConfig({
  plugins: [sqsPlugin(config)],
});
```

### Supported Requests

supports both AWS SDK, CLI and raw low-level API requests.

✅ supported  
🌕 planned  
❌ not planned

- 🌕 AddPermission
- ✅ ChangeMessageVisibility
- ✅ ChangeMessageVisibilityBatch
- 🌕 CreateQueue
- ✅ DeleteMessage
- ✅ DeleteMessageBatch
- ✅ DeleteQueue
- 🌕 GetQueueAttributes
- ✅ GetQueueUrl
- 🌕 ListDeadLetterSourceQueues
- ✅ ListQueues
- ✅ ListQueueTags
- ✅ PurgeQueue
- ✅ ReceiveMessage
- 🌕 RemovePermission
- ✅ SendMessage
- ✅ SendMessageBatch
- 🌕 SetQueueAttributes
- ✅ TagQueue
- ✅ UntagQueue

### Examples

AWS CLI

```bash
aws sqs --region eu-west-1 --endpoint http://localhost:9999/@sqs list-queues
```

AWS SDK

```js
import { SQSClient, ListQueuesCommand } from "@aws-sdk/client-sqs";

const client = new SQSClient({
  region: "eu-west-1",
  endpoint: `http://localhost:9999/@sqs`,
});

const queues = await client.send(new ListQueuesCommand({}));
console.log(queues);
```
