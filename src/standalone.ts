import { ServerlessAwsLambda } from "./main";
import type {
  ICommonConfig,
  IEvents,
  ServerOptions,
  IEventsAlb,
  IEventsHttp,
  IEventsHttpApi,
  IEventsS3,
  IEventsSns,
  IEventsSqs,
  IEventsStream,
  ILambdaFunction,
} from "./standalone_types";
export type { ICommonConfig, IEvents, ServerOptions, IEventsAlb, IEventsHttp, IEventsHttpApi, IEventsS3, IEventsSns, IEventsSqs, IEventsStream, ILambdaFunction };

class FakeSls {
  processedInput = {
    commands: [],
  };
  service = {
    provider: {
      runtime: `node${process.versions.node.split(".")[0]}.x`,
      environment: {},
      timeout: 3,
      memorySize: 1024,
    },
    functions: {},
    package: {},
    getFunction(functionName: string) {
      // @ts-ignore
      return this.functions[functionName];
    },
    custom: {},
  };
  configSchemaHandler = {
    defineFunctionProperties() {},
    schema: {
      properties: {
        package: {},
        functions: {
          patternProperties: {
            ["^[a-zA-Z0-9-_]+$"]: {
              properties: {
                package: {
                  properties: {},
                },
              },
            },
          },
        },
      },
    },
  };

  constructor() {}
}

export async function run(options?: ServerOptions) {
  const fakeSls = new FakeSls();

  let port = 0;

  if (options) {
    if (options.port) {
      port = options.port;
    }

    if (options.configPath) {
      // @ts-ignore
      fakeSls.service.custom["serverless-aws-lambda"] = {
        configPath: options.configPath,
      };
    }

    if (options.functions) {
      options.functions.forEach((lambdaDef) => {
        // @ts-ignore
        fakeSls.service.functions[lambdaDef.name] = lambdaDef;

        if (lambdaDef.events) {
          if (!Array.isArray(lambdaDef.events)) {
            throw new Error("Lambda 'events' must be an array when defined");
          }
        } else {
          // @ts-ignore
          fakeSls.service.functions[lambdaDef.name].events = [];
        }
      });
    }

    if (options.defaults) {
      if (options.defaults.environment) {
        fakeSls.service.provider.environment = options.defaults.environment;
      }

      if (options.defaults.timeout) {
        fakeSls.service.provider.timeout = options.defaults.timeout;
      }

      if (options.defaults.memorySize) {
        fakeSls.service.provider.memorySize = options.defaults.memorySize;
      }

      if (options.defaults.runtime) {
        fakeSls.service.provider.runtime = options.defaults.runtime;
      }
    }
  }

  const sls = new ServerlessAwsLambda(fakeSls, { port: port, debug: options?.debug }, { log() {}, writeText() {}, progress: { get() {}, create() {} } });

  if (typeof options?.onKill == "function") {
    sls.onKill.push(options.onKill);
  }

  let listeningPort = port;
  let listeningUrl = "";

  let serverWaiterResolve: Function;
  const waitServer = new Promise((resolve) => {
    serverWaiterResolve = resolve;
  });
  sls.onceServerReady.push((address) => {
    listeningPort = address.port;
    listeningUrl = address.url;

    serverWaiterResolve();
  });

  await sls.hooks["aws-lambda:run"](false);

  await waitServer;

  return {
    port: listeningPort,
    url: listeningUrl,
    async kill() {
      await sls.kill();
    },
    [Symbol.asyncDispose]: async () => {
      await sls.kill();
    },
  };
}
