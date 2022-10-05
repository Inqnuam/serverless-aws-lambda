## Description

> AWS Application Load Balancer and API Gateway - Lambda dev tool for Serverless. Allows Express synthax in handlers. Supports packaging, local invoking and offline real ALB and APG lambda server mocking.

# Installation

```bash
yarn add -D serverless-aws-lambda
# or
npm install -D serverless-aws-lambda
```

inside your `serverless.yml`

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

---

## Advanced configuration

To have more control over the plugin you can passe a config file via `configPath` variable in plugin options:

```yaml
custom:
  serverless-aws-lambda:
    port: 3000
    watch: true
    configPath: ./config.default
```

Exported config must be a function optionnaly taking one argument, an object which includes:

```jaavscript
{
  lambdas: array, // your Lambda declarations + additional info
  isDeploying: boolean, // indicates if sls is deploying
  setEnv: function, // to dynamically set env variables to your lambdas
  stage: string, // current serverless stag
  port: number // offline server port
}
```

### esbuild

You can customize esbuild by returning on object with `esbuild` key containing [esbuild configuration.](https://esbuild.github.io)  
Most of esbuild options are supported. It isn't the case for example for `entryPoints` which is automatically done by serverless-aws-lambda.

See supported options [full list.](resources/esbuild.md)  
simple example:

```js
const somePlugin = require("some-plugin");

module.exports = ({ lambdas, isDeploying, setEnv, stage, port }) => {
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

### Customize offline server and more:

[See docs.](resources/offline.md)

### Use [Express](https://expressjs.com) syntax with your lambdas

[See docs.](resources/express.md)
