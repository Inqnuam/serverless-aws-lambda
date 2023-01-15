Set offline static path, custom port and add request listeners:

```js
// config.js
module.exports = ({ lambdas, isDeploying, isPackaging, setEnv, stage, port }) => {
  /**
   * @type {import("serverless-aws-lambda").Config}
   */
  return {
    esbuild: {
      //...
    },
    offline: {
      staticPath: "./public",
      port: 9999,
      onReady: (port) => {
        console.log("We are ready to listen on", port);
      },
      request: [
        {
          filter: /^\/__routes(\/)?$/, // filters request when request URL match /__routes
          callback: (req, res) => {
            // node http request Incoming Message and Response object
            res.statusCode = 404;
            res.end(`${req.url} not found`);
          },
        },
      ],
    },
  };
};
```

A very simple example of AWS S3 `PutObject` and `GetObject` implementation:

```js
// config.js

const { access, stat, mkdir } = require("fs/promises");
const { createReadStream, createWriteStream } = require("fs");
const { randomUUID } = require("crypto");
const path = require("path");

module.exports = () => {
  /**
   * @type {import("serverless-aws-lambda").Config}
   */
  const config = {
    offline: {
      staticPath: "./s3",
      request: [
        {
          // filtering all requests to http://localhost:PORT/@s3
          filter: /^\/@s3\/._/,
          callback: async (req, res) => {
            const { url, headers } = req;
            const parsedURL = new URL(url, "http://localhost:3000");

            const requestCmd = parsedURL.searchParams.get("x-id");

            if (requestCmd == "GetObject") {
              try {
                const filePath = decodeURIComponent(parsedURL.pathname.replace("/@s3/", "s3/"));
                const fileStat = await stat(filePath);

                res.writeHead(200, {
                  "Content-Type": "application/json",
                  "Content-Length": fileStat.size,
                  "x-amzn-requestid": headers["amz-sdk-invocation-id"] ?? randomUUID(),
                });

                createReadStream(filePath).pipe(res);
              } catch (error) {
                console.log(error);
                res.statusCode = 404;
                res.end("Not Found");
              }
            } else if (requestCmd == "PutObject") {
              try {
                await access(filePath);
              } catch (error) {
                await mkdir(path.dirname(filePath), { recursive: true });
              }
              const savingFile = createWriteStream(filePath);
              res.setHeader("status", 100);
              req.pipe(savingFile);

              req.on("end", function () {
                res.end("Saved");
              });
            } else {
              res.statusCode = 502;
              res.end("Not implemented yet :(");
            }
          },
        },
      ],
    },
  };
  return config;
};
```

`PutObject` then `GetObject` from your project's root dir s3 folder

```js
// handler.js
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const client = new S3Client({
  region: "eu-west-3",
  endpoint: `http://0.0.0.0:${process.env.LOCAL_PORT}/@s3`, // <- important
});

export default async (event, context) => {
  // some app logic

  if (event.headers["x-api-key"] == "thisIsSuperSecret") {
    const Bucket = "MyBucket";
    const Key = "some/file.json";

    const putCmd = new PutObjectCommand({
      Bucket,
      Key,
      Body: JSON.stringify({ hello: "world" }),
    });

    const putResponse = await client.send(putCmd);
    console.log(putResponse);

    const cmd = new GetObjectCommand({
      Bucket,
      Key,
    });
    const response = await client.send(cmd);
    console.log(response);
    // do something

    return {
      statusCode: 200,
      body: "Everyting is fine!",
    };
  } else {
    return {
      statusCode: 403,
      body: "Forbidden",
    };
  }
};
```

### Callback after (each) build:

`config.js`

```js
module.exports = ({ lambdas, isDeploying, isPackaging, setEnv, stage, port }) => {
  return {
    esbuild: {
      // ...
    },
    offline: {
      // ...
    },
    buildCallback: async (result, isRebuild) => {
      // result = esbuild build result
      if (!isDeploying) {
        console.log(`${new Date().toLocalString()} build!`);
      }
    },
  };
};
```

### Dynamically set env variable to a Lambda:

`config.js`

```js
module.exports = ({ lambdas, isDeploying, isPackaging, setEnv, stage, port }) => {
  return {
    esbuild: {
      // ...
    },
    offline: {
      // ...
    },
    buildCallback: async (result) => {
      if (isDeploying) {
        const foundLambda = lambdas.find((x) => x.name == "myLambda");

        if (foundLambda) {
          // OLD method: from provided 'setEnv' function
          setEnv(foundLambda.name, "env_key", "env_value");
          // NEW method
          foundLambda.setEnv("env_key", "env_value");
        }
      }
    },
  };
};
```

### virtualEnvs

serverless-aws-lambda adds `virtualEnvs` object support to your serverless.yml.
values which can be accessed only in your custom config lambda function.  
An example:

```yaml
# serverless.yml
service: myapp

frameworkVersion: "3"
configValidationMode: error

plugins:
  - serverless-aws-lambda

custom:
  virtualEnvs:
    S3_BUCKET: mybucket # default bucket name
  serverless-aws-lambda:
    port: 3000
    watch: true
    configPath: ./config.default

functions:
  players:
    handler: src/api/routes/players.default
    virtualEnvs:
      S3_BUCKET: myPlayersPhotoBucket # bucket name for this lambda
    events:
      - alb:
          listenerArn: arn:aws:elasticloadbalancing:eu-west-3:0000000000000:listener/app/myAlb/11111111111111/2222222222222
          priority: 457
          conditions:
            path: "/v1/players"
            method: ["GET", "DELETE"]
```

```js
// config.js
module.exports = ({ lambdas, isDeploying, isPackaging, setEnv, stage, port }) => {
  return {
    esbuild: {
      // ...
    },
    offline: {
      // ...
    },
    buildCallback: async (result) => {
      const foundLambda = lambdas.find((x) => x.name == "players");

      if (foundLambda) {
        console.log(foundLambda.virtualEnvs);
      }
    },
  };
};
```

## Invoke on the fly 🚀

This feature combined with your custom offline request listeners may be usefull to implement new AWS serivces to your offline environment.

```js
module.exports = ({ lambdas, port }) => {
  const foundAwsomeLambda = lambdas.find((x) => x.name == "AwsomeLambda");

  if (foundAwsomeLambda) {
    foundAwsomeLambda.invoke({ customEvent: { Hello: "World" } });
  }
};
```

## Run serverless-aws-lambda programmatically

```js
import { Server } from "serverless-aws-lambda/server";

const server = new Server({
  stage: "dev",
  port: 9999,
  watch: true,
  debug: true,
  onRebuild: async () => {
    await doSomething();
  },
});

const { port } = await server.start();

// do something
// then
// kill it
server.stop();
```
