## Description

[defineConfig](../src/defineConfig.ts) is a fully typed function which provides an interface where you can:

- customize [esbuild](esbuild.md)
- configure offline server (static path, port, custom routes)
- invoke lambdas with a custom event
- play with env variables on the fly
- add plugins to serverless-aws-lambda.

### Usage

```yaml
# serverless.yml
custom:
  serverless-aws-lambda:
    configPath: ./config.ts
```

To get Type definitions please set `"moduleResolution": "NodeNext"` inside your `tsconfig.json`.

```ts
// config.ts
import { defineConfig } from "serverless-aws-lambda/defineConfig";

export default defineConfig({
  esbuild: {
    target: "es2020",
  },
  offline: {
    staticPath: "./public",
    port: 9999,
  },
  plugins: [],
});
```

#### Create a custom plugin which may be used inside defineConfig's `plugins`

```js
import { defineConfig } from "serverless-aws-lambda/defineConfig";
import type { SlsAwsLambdaPlugin } from "serverless-aws-lambda/defineConfig";

 const myCustomPlugin:SlsAwsLambdaPlugin = {
      name: "my-custom-plugin",
      onInit: async function () {
        // do something
        console.log("Hello from myCustomPlugin")
        console.log(this);
      },
      buildCallback : async function (result, isRebuild) {
        // do something
      },
      offline: {
        onReady: function (port, ip) {
          console.log("Offline port", port)
        },
        request: [
          {
            method: "GET",
            filter: "/routes",
            callback: async function (req, res) {
              const foundLambda = this.lambdas.find((x) => x.name == "myAwsomeLambda");

              if (foundLambda) {
                const customEvent = {
                  some: "value",
                };
                const lambdaResponse = await foundLambda.invoke(customEvent);

                res.end(lambdaResponse);
              } else {
                res.statusCode = 404;
                res.end("Not Found");
              }
            },
          },
        ],
      },
    },



export default defineConfig({
  esbuild: {
    target: "es2020",
  },
  offline: {
    staticPath: "./public",
    port: 9999,
  },
  plugins: [myCustomPlugin],
});
```
