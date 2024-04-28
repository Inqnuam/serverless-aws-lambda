## AWS Local SQS

### Description

Wrapper for [Local AWS SQS](https://github.com/Inqnuam/local-aws-sqs).  
This plugin automatically creates all Queues declared in `serverless.yml` and enables SQS EventSourceMapping by setting AWS SQS Client config in [defineConfig](./defineConfig.md) `services` if it is not already defined.

### Usage

Import the plugin inside your defineConfig.  
To define default and/or override Queue attributes see [Plugin configs](../src/plugins/sqs/types.ts).

```js
// config.ts
import { defineConfig } from "serverless-aws-lambda/defineConfig";
import { sqsPlugin } = from "serverless-aws-lambda/sqs";

export default defineConfig({
  plugins: [sqsPlugin(config)],
});
```
