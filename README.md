## Description

> AWS Application Load Balancer and API Gateway - Lambda dev tool for Serverless. Allows Express synthax in handlers. Supports packaging, local invoking and offline real ALB and APG lambda server mocking.

# Installation

```bash
yarn add -D serverless-aws-lambda
# or
npm install -D serverless-aws-lambda
```

a simple configuration (not required) inside your `serverless.yml`

```yaml
service: myapp

frameworkVersion: "3"
configValidationMode: error

plugins:
  - serverless-aws-lambda

custom:
  serverless-aws-lambda:
    port: 3000
    watch: true
```

to trigger offline server passe `aws-lambda` into your serverless CLI commande:

```bash
sls aws-lambda -s dev
```

It is also possible to passe port and watch options from the CLI with `--port` or `-p` and `--watch` or `-w`.

Command line values will overwrite serverless.yml custom > serverless-aws-lambda values if they are set.

### Invoke

Offline server supports ALB and APG endponts. Appropriate `event` object is sent to the handler based on your lambda declaration.  
However if your declare both `alb` and `http` into a single lambda `events` you have to set `X-Mock-Type` as header in your request or in your query string with `x_mock_type` which accepts `alb` or `apg`.  
Please note that invoking a lambda from sls CLI (`sls invoke local -f myFunction`) will not trigger the offline server. But you are still able to inject any event with `-d 'someData'` sls CLI option.

You can also invoke your Lambdas with a custom `event` object by making a POST request to:  
http://localhost:3000/@invoke/myAwsomeLambda  
for `aws-sdk` Lambda client compatibility it is also possible to request to:  
http://localhost:3000/2015-03-31/functions/myAwsomeLambda/invocations

Example with with `aws-sdk` Lambda Client:

```js
const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");

const client = new LambdaClient({ region: "PARADISE", endpoint: "http://localhost:3000" });
const DryRun = "DryRun";
const Event = "Event";
const RequestResponse = "RequestResponse";

const cmd = new InvokeCommand({
  FunctionName: "myAwsomeLambda",
  InvocationType: RequestResponse,
  Payload: Buffer.from(JSON.stringify({ foo: "bar" })),
});

client
  .send(cmd)
  .then((data) => {
    data.Payload = new TextDecoder("utf-8").decode(data.Payload);
    console.log(data);
  })
  .catch((error) => {
    // 🥲
    console.log("error", error);
  });
```

### Environment variable

Lambdas are executed in worker threads. Only variables declared in your `serverless.yml` are injected into `process.env` except `IS_LOCAL`, `LOCAL_PORT` and `NODE_ENV`

---

## Advanced configuration:

To have more control over the plugin you can passe a config file via `configPath` variable in plugin options:

```yaml
custom:
  serverless-aws-lambda:
    port: 3000
    watch: true
    configPath: ./config.default
```

Exported config must be a function optionnaly taking one argument, an object which provides following values:

```jaavscript
{
  lambdas: array, // your Lambda declarations + additional info
  isDeploying: boolean, // indicates if sls is deploying
  isPackaging: boolean, // indicates if sls is packaging
  setEnv: function, // to dynamically set env variables to your lambdas
  stage: string, // current serverless stag
  port: number, // offline server port
  esbuild: object // esbuild instance
}
```

### esbuild:

You can customize esbuild by returning an object with `esbuild` key containing [esbuild configuration.](https://esbuild.github.io)  
Most of esbuild options are supported. It isn't the case for example for `entryPoints` which is automatically done by serverless-aws-lambda.

See supported options [full list.](resources/esbuild.md)  
simple example:

```js
const somePlugin = require("some-plugin");

module.exports = ({ lambdas, isDeploying, isPackaging, setEnv, stage, port, esbuild }) => {
  return {
    esbuild: {
      plugins: [somePlugin],
      external: ["pg-hstore"],
      loader: {
        ".png": "file",
      },
    },
  };
};
```

`serverless-aws-lambda` provides [defineConfig](resources/defineConfig.md) with TypeScript and a plugin interface support which could improve your config declaration.

### AWS SNS

serverless-aws-lambda supports AWS SNS `Publish` and `PublishBatch` actions with `snsPlugin` (see [defineConfig](resources/defineConfig.md)) to invoke linked lambdas.
Example:

```yaml
# serverless.yml

functions:
  myAwsomeLambda:
    handler: src/myAwsomeLambda.default
    events:
      - sns: MyTopic
```

```js
// handler.js
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const params = process.env.IS_LOCAL
  ? {
      region: "eu-west-3",
      endpoint: `http://localhost:${process.env.LOCAL_PORT}/@sns`, // <- important
    }
  : {};
const client = new SNSClient(params);

export default async (event) => {
  // some app logic ...

  const msg = {
    order: {
      id: 1234567890,
      status: "PUBLISHED",
    },
  };

  const cmd = new PublishCommand({
    TopicArn: "arn:aws:sns:eu-west-3:123456789012:MyTopic",
    Message: JSON.stringify({
      default: JSON.stringify(msg),
    }),
    MessageStructure: "json",
    MessageAttributes: {
      Hello: {
        DataType: "String",
        StringValue: "world",
      },
    },
  });

  try {
    await client.send(cmd);
    return {
      statusCode: 200,
    };
  } catch {
    return {
      statusCode: 502,
    };
  }
};
```

Topic arn, filterPolicy and filterPolicyScope are supported as well!

### Customize offline server and much more:

[See docs.](resources/offline.md)

### Use [Express](https://expressjs.com) syntax with your lambdas:

[See docs.](resources/express.md)

---

### TDD/TI:

Inside [resources](resources) directory you can find configuration files for test runners:  
[Vitest (recommnded)](https://github.com/Inqnuam/serverless-aws-lambda-vitest)  
[Jest](https://github.com/Inqnuam/serverless-aws-lambda-jest)  
With theses configurations your project bundeling and serving is delegated to serverless-aws-lambda 🎉
