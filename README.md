[![NPM](https://nodei.co/npm/serverless-aws-lambda.png?compact=true)](https://nodei.co/npm/serverless-aws-lambda/)

## Description

> AWS Lambda dev tool for Serverless. Allows Express synthax in handlers. Supports packaging, local invoking and offline Application Load Balancer and API Gateway lambda server mocking.

- Plug & Play (easy to install, configure and use)
- Highly customizable
- Functions are bundled by [esbuild](https://github.com/evanw/esbuild)
- Offline server uses NodeJS `http` module
- Packaging is made by [node-archiver](https://github.com/archiverjs/node-archiver)

### Supported Runtimes

- NodeJS
- Python
- Ruby

# Installation

```bash
yarn add -D serverless-aws-lambda
# or
npm install -D serverless-aws-lambda
```

```yaml
service: myapp

frameworkVersion: "3"
configValidationMode: error

plugins:
  - serverless-aws-lambda
```

---

### Usage

Start the offline server

```bash
SLS_DEBUG="*" sls aws-lambda -s dev
```

It is also possible to passe port from the CLI with `--port` or `-p`.

This will overwrite serverless.yml custom > serverless-aws-lambda values if they are set.

### Invoke

Offline server supports Application Load Balancer and API Gateway and Function URL endpoints (see [plugins](#plugins) for more triggers).  
Appropriate `event` object is sent to the handler based on your lambda declaration.

```yaml
functions:
  myAwsomeLambda:
    handler: src/handlers/awsomeLambda.default
    events:
      - alb:
          listenerArn: arn:aws:elasticloadbalancing:eu-west-3:170838072631:listener/app/myAlb/bf88e6ec8f3d91df/e653b73728d04626
          priority: 939
          conditions:
            path: "/paradise"
            method: GET
```

`myAwsomeLambda` is available at `http://localhost:PORT/paradise`

However if your declare both `alb` and `http` or `httpApi` inside a single lambda `events` with the same `path` you have to specify desired server by setting `alb` or `apg` inside your request's:

- header with `X-Mock-Type`.
- or in query string with `x_mock_type`.

Please note that invoking a lambda from sls CLI (`sls invoke local -f myFunction`) will not trigger the offline server. But will still make your handler ready to be invoked.

To invoke your Lambda like with AWS Console's `Test` button prefix your Lambda name by `@invoke/`.  
Example:  
http://localhost:3000/@invoke/myAwsomeLambda

Example with with `aws-sdk` Lambda Client:

```js
const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");

const client = new LambdaClient({ region: "us-east-1", endpoint: "http://localhost:3000" });
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

---

### Environment variable

Lambdas are executed in worker threads. Only variables declared in your `serverless.yml` are injected into `process.env` except `IS_LOCAL`, `LOCAL_PORT` and `NODE_ENV`.

---

### Extended properties

- `online`  
  Adding the param `online: false` will omit the deployement of your Lambda.

```yaml
functions:
  myAwsomeLambda:
    handler: src/handlers/awsomeLambda.default
    online: false
```

- `files`  
  include additional files into the package.

```yaml
functions:
  myAwsomeLambda:
    handler: src/handlers/awsomeLambda.default
    files:
      - ./resources/some/file.png
      - ./resources/anotherFile.pdf
```

- `virtualEnvs`  
  on key-value object which will only be available inside [defineConfig](resources/defineConfig.md).  
  by default virtualEnvs are inherited from custom > virtualEnvs if exists.

---

### Advanced configuration:

To have more control over the plugin you can passe a config file via `configPath` param in plugin options:

```yaml
custom:
  serverless-aws-lambda:
    configPath: ./config.default
```

See [defineConfig](resources/defineConfig.md) for advanced configuration.

---

### Use [Express](https://expressjs.com) syntax with your lambdas:

[See docs.](resources/express.md)

---

### Plugins:

- [AWS Local S3](resources/s3.md)
- [AWS Local SNS](resources/sns.md)
- [AWS Local SQS](resources/sqs.md)
- [DocumentDB Local Streams](https://github.com/Inqnuam/serverless-aws-lambda-documentdb-streams)
- [DynamoDB Local Streams](https://github.com/Inqnuam/serverless-aws-lambda-ddb-streams)
- [Jest](https://github.com/Inqnuam/serverless-aws-lambda-jest)
- [Vitest](https://github.com/Inqnuam/serverless-aws-lambda-vitest)
