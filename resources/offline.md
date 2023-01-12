Set offline static path, custom port and add request handlers:  
`config.js`

```js
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

Callback after (each) build:  
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
      // result = esbuild build result
      if (!isDeploying) {
        console.log(`${new Date().toLocalString()} build!`);
      }
    },
  };
};
```

Dynamically set env variable to a Lambda:  
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
          setEnv(foundLambda.name, "env_key", "env_value");
        }
      }
    },
  };
};
```

serverless-aws-lambda adds `virtualEnvs` object support to your serverless.yml.
values which can be accessed only in your custom config lambda function.  
An example:

`serverless.yml`

```yaml
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
      const foundLambda = lambdas.find((x) => x.name == "players");

      if (foundLambda) {
        console.log(foundLambda.virtualEnvs);
      }
    },
  };
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
