```js
// config.js
const { defineConfig } = require("serverless-aws-lambda/defineConfig");
const { snsPlugin } = require("serverless-aws-lambda/sns");

module.exports.default = defineConfig({
  esbuild: {
    target: "es2020",
  },
  offline: {
    staticPath: "./public",
    port: 9999,
  },
  plugins: [
    snsPlugin(),
    {
      name: "my-custom-plugin",
      onInit: async function () {
        // do something
        console.log(this);
      },
      offline: {
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
  ],
});
```
