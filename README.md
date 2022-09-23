# Motivation

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
    static: ./public
    esBuildConfig: ./path/to/esbuild/configFile.default
```

to trigger the plugin passe `aws-lambda` into your serverless CLI commande:

```bash
sls aws-lambda -s dev
```

It is also possible to passe port and watch options from the CLI with `--port` or `-p` and `--watch` or `-w`.

Command line values will overwrite serverless.yml custom values if they are set.
