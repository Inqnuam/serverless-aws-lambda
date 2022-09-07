# Motivation

# Installation

```bash
yarn add -D serverless-alb-offline
# or
npm install -D serverless-alb-offline
```

inside your `serverless.yml`

```yaml
service: myapp

frameworkVersion: "3"
configValidationMode: error

plugins:
  - serverless-alb-offline

custom:
  serverless-alb-offline:
    port: 3000
    watch: true
```

to trigger the plugin passe `alb-offline` into your serverless CLI commande:

```bash
sls alb-offline -s dev
```

It is also possible to passe port and watch options from the CLI with `--port` or `-p` and `--watch` or `-w`.

Command line values will overwrite serverless.yml custom values if they are set.
