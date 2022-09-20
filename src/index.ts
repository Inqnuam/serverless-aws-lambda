import path from "path";
import { ApplicationLoadBalancer } from "./lib/alb";
import { ILambdaMock } from "./lib/lambda";
import { log } from "./lib/colorize";
import { zip } from "./lib/zip";
import { build, BuildOptions } from "esbuild";
import { nodeExternalsPlugin } from "esbuild-node-externals";
import { hbs } from "./lib/handlebars";
import { Lambda } from "./lib/index";
import { LambdaEndpoint } from "./lib/lambda";
import { AlbRouter, HttpMethod } from "./lib/router";
//const { ExpressLambda } = require("./lib/expressLambda.js");

const cwd = process.cwd();
const DEFAULT_LAMBDA_TIMEOUT = 6;
const DEFAULT_LAMBDA_MEMORY_SIZE = 1024;
const isLocalEnv = {
  IS_OFFLINE: true,
  IS_LOCAL: true,
};

class ServerlessAlbOffline extends ApplicationLoadBalancer {
  #lambdas: ILambdaMock[];
  watch = true;
  serverless: any;
  options: any;
  pluginConfig: any;
  tsconfig: any;
  commands: any;
  hooks: any;
  esBuildConfig: any;
  runtimeConfig: any;
  constructor(serverless, options) {
    super({ debug: process.env.SLS_DEBUG == "*" });
    this.#lambdas = [];
    this.serverless = serverless;
    this.options = options;

    this.pluginConfig = this.serverless.service.custom["serverless-alb-lambda"];

    ServerlessAlbOffline.PORT = this.options.p ?? this.options.port ?? this.pluginConfig?.port ?? process.env.PORT;

    this.#setWatchValue();

    if (this.pluginConfig?.tsconfig) {
      this.tsconfig = this.pluginConfig.tsconfig;
    }

    if (this.pluginConfig.static) {
      this.serve = this.pluginConfig.static as string;
    }

    //  this.serverless.service.getFunction(funcName);
    this.commands = {
      "alb-lambda": {
        usage: "Mock AWS ALB-Lambda",
        lifecycleEvents: ["run"],
        options: {
          port: {
            usage: "Specify the server port (default: 3000)",
            shortcut: "p",
            required: false,
            type: "number",
          },
          watch: {
            usage: "Watch for file changes (default: true)",
            shortcut: "w",
            required: false,
            type: "boolean",
          },
        },
      },
    };

    this.hooks = {
      // TODO: check signle function deploy
      "alb-lambda:run": this.init.bind(this),
      "before:package:createDeploymentArtifacts": this.init.bind(this, true),
      "before:deploy:deploy": this.init.bind(this, true),
      "before:invoke:local:invoke": this.invokeLocal.bind(this),
    };
  }

  async invokeLocal() {
    await this.init(false, this.options.function);
  }
  async init(isPackaging: boolean, invokeName: string) {
    this.#setRuntimeEnvs();
    this.#lambdas = this.#getAlbLambdas(invokeName);
    this.#setEsBuildConfig(isPackaging, invokeName);
    await this.buildAndWatch(isPackaging, invokeName);
  }
  #setEsBuildConfig(isPackaging: boolean, invokeName: string) {
    const entryPoints = this.#lambdas.map((x) => x.esEntryPoint);

    const plugins = [
      hbs(),

      // ExpressLambda({ dev: !isPackaging })
    ];

    let esBuildConfig: BuildOptions = {
      platform: "node",
      sourcemap: !isPackaging,
      minify: isPackaging,
      metafile: true,
      target: "ES2018",
      entryPoints: entryPoints,
      outdir: path.join(cwd, ".alb_lambda"),
      outbase: "src",
      bundle: true,
      external: ["aws-sdk"],
      plugins,
      watch: false,
    };

    if (!isPackaging) {
      plugins.unshift(nodeExternalsPlugin());

      if (!invokeName && this.watch) {
        esBuildConfig.watch = {
          onRebuild: this.#onRebuild.bind(this),
        };
      }
    }

    if (this.tsconfig) {
      esBuildConfig.tsconfig = this.tsconfig;
    }

    this.esBuildConfig = esBuildConfig;
  }

  #setWatchValue() {
    const opts = { ...this.pluginConfig, ...this.options };
    Object.keys(opts)
      .filter((e) => e == "w" || e == "watch")
      .forEach((k) => {
        const w = opts[k];

        if (typeof w == "string") {
          if (w == "false") {
            this.watch = false;
          }
        } else if (typeof w == "boolean") {
          this.watch = w;
        }
      });
  }
  async buildAndWatch(isPackaging: boolean, invokeName: string) {
    const result = await build(this.esBuildConfig);
    const { outputs } = result.metafile!;
    this.#setLambdaEsOutputPaths(outputs);

    if (!isPackaging && !invokeName) {
      this.listen(ServerlessAlbOffline.PORT, async (port, localIp) => {
        AlbRouter.PORT = port;
        await this.load(this.#lambdas);

        let output = `✅ Application Load Balancer is listening on http://localhost:${port}`;

        if (localIp) {
          output += ` | http://${localIp}:${port}`;
        }

        log.GREEN(output);
      });
    } else if (invokeName) {
      const slsDeclaration = this.serverless.service.getFunction(invokeName);
      const foundLambda = this.#lambdas.find((x) => x.name == invokeName);

      if (foundLambda) {
        slsDeclaration.handler = foundLambda.esOutputPath.replace(`${cwd}/`, "").replace(".js", `.${foundLambda.handlerName}`);
      }
    } else {
      // TODO: convert to promise all
      for (const l of this.#lambdas) {
        const slsDeclaration = this.serverless.service.getFunction(l.name);

        const path = l.esOutputPath;
        await zip(path.slice(0, -3));

        slsDeclaration.package = { ...slsDeclaration.package, disable: true, artifact: path.replace(".js", ".zip") };
      }
    }
  }

  async #onRebuild(error, result) {
    if (error) {
      log.RED("watch build failed:");
      console.error(error);
    } else {
      this.#setLambdaEsOutputPaths(result.metafile.outputs);
      await this.load(this.#lambdas);

      log.GREEN("🔄✅ Rebuild ");
    }
  }
  #getAlbLambdas(invokeName: string) {
    const funcs = this.serverless.service.functions;
    let functionsNames = Object.keys(funcs);

    if (invokeName) {
      functionsNames = functionsNames.filter((x) => x == invokeName);
    }
    const albs = functionsNames.reduce((accum: any[], funcName: string) => {
      const lambda = funcs[funcName];

      const handlerPath = lambda.handler;
      const lastPointIndex = handlerPath.lastIndexOf(".");
      const handlerName = handlerPath.slice(lastPointIndex + 1);
      const esEntryPoint = path.join(cwd, handlerPath.slice(0, lastPointIndex));
      const region = {
        AWS_REGION: this.runtimeConfig.environment.AWS_REGION ?? this.runtimeConfig.environment.REGION,
      };

      let lambdaDef = {
        name: funcName,
        handlerPath,
        handlerName,
        esEntryPoint,
        memorySize: lambda.memorySize ?? this.runtimeConfig.memorySize ?? DEFAULT_LAMBDA_MEMORY_SIZE,
        timeout: lambda.timeout ?? this.runtimeConfig.timeout ?? DEFAULT_LAMBDA_TIMEOUT,
        endpoints: [],
        environment: {
          ...this.runtimeConfig.environment,
          ...lambda.environment,
          ...region,
          ...isLocalEnv,
        },
      };

      // const events = lambda.events;

      //   ?.filter((x) =>
      //   Object.keys(x)
      //     .map((x) => x.toLowerCase())
      //     .includes("alb")
      // );
      if (lambda.events.length) {
        lambdaDef.endpoints = lambda.events.map(this.#parseSlsEventDefinition).filter((x) => x);
      }
      accum.push(lambdaDef);
      return accum;

      // events.forEach((event) => {
      //   const alb = event.alb;

      //   // NOTE: httpApi = APG v2 (HTTP)
      //   // http = APG v1 (REST)
      //   // both are:
      //   // objects with path (string) and optionnal method (string)
      //   // OR both are string including method - path

      //   // alb application load balancer

      //   // alb.method (array) is not required, default is "any"

      //   if (alb?.conditions && alb.conditions.path?.length && alb.conditions.method?.length) {
      //     // @ts-ignore
      //     lambdaDef.path = alb.conditions.path[0];
      //     // @ts-ignore
      //     lambdaDef.method = alb.conditions.method[0].toUpperCase();
      //     // @ts-ignore
      //     lambdaDef.kind = "ALB";
      //     accum.push(lambdaDef);
      //   }
      // });

      // return accum;
    }, []);

    return albs;
  }

  #parseSlsEventDefinition(event): LambdaEndpoint | null {
    const supportedEvents = ["http", "httpApi", "alb"];

    const keys = Object.keys(event);

    if (!keys.length || !supportedEvents.includes(keys[0])) {
      return null;
    }

    let parsendEvent: LambdaEndpoint = {
      kind: "alb",
      paths: [],
      methods: ["ANY"],
    };

    if (event.alb) {
      if (!event.alb.conditions || !event.alb.conditions.path?.length) {
        return null;
      }

      parsendEvent.kind = "alb";
      parsendEvent.paths = event.alb.conditions.path;

      if (event.alb.conditions.method?.length) {
        parsendEvent.methods = event.alb.conditions.method.map((x: string) => x.toUpperCase());
      }
    } else if (event.http || event.httpApi) {
      parsendEvent.kind = "apg";
      const httpEvent = event.http ?? event.httpApi;

      if (typeof httpEvent == "string") {
        // ex: 'PUT /users/update'
        const declarationComponents = httpEvent.split(" ");

        if (declarationComponents.length != 2) {
          return null;
        }

        parsendEvent.methods = [declarationComponents[0].toUpperCase() as HttpMethod];
        parsendEvent.paths = [declarationComponents[1]];
      } else if (typeof httpEvent == "object" && httpEvent.path) {
        parsendEvent.paths = [httpEvent.path];

        if (httpEvent.method) {
          parsendEvent.methods = [httpEvent.method.toUpperCase()];
        }
      } else {
        return null;
      }
    }

    return parsendEvent;
  }
  #setLambdaEsOutputPaths(outputs) {
    const outputNames = Object.keys(outputs)
      .filter((x) => !x.endsWith(".map") && outputs[x].entryPoint)
      .map((x) => {
        const element = outputs[x];
        const lastPointIndex = element.entryPoint.lastIndexOf(".");
        const entryPoint = path.join(cwd, element.entryPoint.slice(0, lastPointIndex));
        const esOutputPath = path.join(cwd, x);

        return {
          esOutputPath,
          entryPoint,
        };
      });

    this.#lambdas.forEach((x) => {
      const foundOutput = outputNames.find((w) => w.entryPoint == x.esEntryPoint);

      if (foundOutput) {
        x.esOutputPath = foundOutput.esOutputPath;
      }
    });
  }

  #setRuntimeEnvs() {
    const { environment, memorySize, timeout } = this.serverless.service.provider;

    this.runtimeConfig.memorySize = memorySize;
    this.runtimeConfig.timeout = timeout;
    this.runtimeConfig.environment = environment ?? {};
    this.runtimeConfig.environment.AWS_PROFILE = process.env.AWS_PROFILE;
  }
}

module.exports = ServerlessAlbOffline;
module.exports.Lambda = Lambda;
