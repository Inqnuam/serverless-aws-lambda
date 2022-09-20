# Motivation

# Installation

```bash
yarn add -D serverless-alb-lambda
# or
npm install -D serverless-alb-lambda
```

inside your `serverless.yml`

```yaml
service: myapp

frameworkVersion: "3"
configValidationMode: error

plugins:
  - serverless-alb-lambda

custom:
  serverless-alb-lambda:
    port: 3000
    watch: true
    static: ./public
```

to trigger the plugin passe `alb-lambda` into your serverless CLI commande:

```bash
sls alb-lambda -s dev
```

It is also possible to passe port and watch options from the CLI with `--port` or `-p` and `--watch` or `-w`.

Command line values will overwrite serverless.yml custom values if they are set.
