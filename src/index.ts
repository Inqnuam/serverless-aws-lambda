import path from "path";
import { ApplicationLoadBalancer } from "./lib/alb";
import { ILambdaMock } from "./lib/lambdaMock";
import { log } from "./lib/colorize";
import { zip } from "./lib/zip";
import { build, BuildOptions } from "esbuild";
import { nodeExternalsPlugin } from "esbuild-node-externals";
import { LambdaEndpoint } from "./lib/lambdaMock";
import { AlbRouter, HttpMethod } from "./lib/router";

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
  isDeploying = false;
  serverless: any;
  options: any;
  pluginConfig: any;
  tsconfig: any;
  commands: any;
  hooks: any;
  esBuildConfig: any;
  customEsBuildConfig: any;
  customBuildCallback?: Function;
  runtimeConfig: any;
  defaultVirtualEnvs: any;

  constructor(serverless: any, options: any) {
    super({ debug: process.env.SLS_DEBUG == "*" });
    log.BR_BLUE("Launching serverless-aws-lambda...");
    this.#lambdas = [];
    this.serverless = serverless;
    this.options = options;

    serverless.configSchemaHandler.defineFunctionProperties("aws", {
      properties: {
        virtualEnvs: { type: "object" },
      },
    });

    if (this.serverless.service.custom) {
      this.pluginConfig = this.serverless.service.custom["serverless-aws-lambda"];
      this.defaultVirtualEnvs = this.serverless.service.custom["virtualEnvs"] ?? {};
      ServerlessAlbOffline.PORT = this.pluginConfig?.port;
    }

    ServerlessAlbOffline.PORT = this.options.p ?? this.options.port ?? process.env.PORT;

    this.#setWatchValue();

    this.commands = {
      "aws-lambda": {
        usage: "Mock AWS AWS-Lambda",
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
      "aws-lambda:run": this.init.bind(this),
      "before:package:createDeploymentArtifacts": this.init.bind(this, true),
      "before:deploy:deploy": this.deploy.bind(this),
      "before:invoke:local:invoke": this.invokeLocal.bind(this),
    };
  }

  async invokeLocal() {
    await this.init(false, this.options.function);
  }

  async deploy() {
    this.isDeploying = true;
    await this.init(true);
  }
  async init(isPackaging: boolean, invokeName?: string) {
    this.isDeploying = isPackaging;
    this.#setRuntimeEnvs();
    this.#lambdas = this.#getAlbLambdas(invokeName);

    await this.#setCustomEsBuildConfig();
    this.#setEsBuildConfig(isPackaging, invokeName);
    await this.buildAndWatch(isPackaging, invokeName);
  }

  #setEsBuildConfig(isPackaging: boolean, invokeName?: string) {
    const entryPoints = this.#lambdas.map((x) => x.esEntryPoint);

    let esBuildConfig: BuildOptions = {
      platform: "node",
      sourcemap: !isPackaging,
      minify: isPackaging,
      metafile: true,
      target: "ES2018",
      entryPoints: entryPoints,
      outdir: path.join(cwd, ".aws_lambda"),
      outbase: "src",
      bundle: true,
      plugins: [],
      external: ["aws-sdk", "esbuild"],
      watch: false,
    };

    if (!isPackaging) {
      esBuildConfig.plugins!.unshift(nodeExternalsPlugin());

      if (!invokeName && this.watch) {
        esBuildConfig.watch = {
          onRebuild: this.#onRebuild.bind(this),
        };
      }
    }

    if (this.customEsBuildConfig) {
      if (Array.isArray(this.customEsBuildConfig.plugins)) {
        esBuildConfig.plugins!.push(...this.customEsBuildConfig.plugins);
      }

      if (Array.isArray(this.customEsBuildConfig.external)) {
        esBuildConfig.external!.push(...this.customEsBuildConfig.external);
      }

      if (typeof this.customEsBuildConfig.sourcemap == "boolean") {
        esBuildConfig.sourcemap = this.customEsBuildConfig.sourcemap;
      }

      if (typeof this.customEsBuildConfig.minify == "boolean") {
        esBuildConfig.minify = this.customEsBuildConfig.minify;
      }

      if (typeof this.customEsBuildConfig.outdir == "string") {
        esBuildConfig.outdir = this.customEsBuildConfig.outdir;
      }

      if (typeof this.customEsBuildConfig.outbase == "string") {
        esBuildConfig.outbase = this.customEsBuildConfig.outbase;
      }

      if (typeof this.customEsBuildConfig.target == "string") {
        esBuildConfig.target = this.customEsBuildConfig.target;
      }

      if (typeof this.customEsBuildConfig.tsconfig == "string") {
        esBuildConfig.tsconfig = this.customEsBuildConfig.tsconfig;
      }

      if (typeof this.customEsBuildConfig.tsconfigRaw == "string") {
        // @ts-ignore
        esBuildConfig.tsconfigRaw = this.customEsBuildConfig.tsconfigRaw;
      }

      if (typeof this.customEsBuildConfig.legalComments == "string") {
        esBuildConfig.legalComments = this.customEsBuildConfig.legalComments;
      }

      if (Array.isArray(this.customEsBuildConfig.pure)) {
        esBuildConfig.pure = this.customEsBuildConfig.pure;
      }

      if (Array.isArray(this.customEsBuildConfig.drop)) {
        esBuildConfig.drop = this.customEsBuildConfig.drop;
      }

      if (Array.isArray(this.customEsBuildConfig.resolveExtensions)) {
        esBuildConfig.resolveExtensions = this.customEsBuildConfig.resolveExtensions;
      }

      if (typeof this.customEsBuildConfig.ignoreAnnotations == "boolean") {
        esBuildConfig.ignoreAnnotations = this.customEsBuildConfig.ignoreAnnotations;
      }
      if (typeof this.customEsBuildConfig.treeShaking == "boolean") {
        esBuildConfig.treeShaking = this.customEsBuildConfig.treeShaking;
      }

      if (this.customEsBuildConfig.define && typeof this.customEsBuildConfig.define == "object") {
        esBuildConfig.define = this.customEsBuildConfig.define;
      }

      if (this.customEsBuildConfig.banner && typeof this.customEsBuildConfig.banner == "object") {
        esBuildConfig.banner = this.customEsBuildConfig.banner;
      }
      if (this.customEsBuildConfig.footer && typeof this.customEsBuildConfig.footer == "object") {
        esBuildConfig.footer = this.customEsBuildConfig.footer;
      }

      if (this.customEsBuildConfig.loader && typeof this.customEsBuildConfig.loader == "object") {
        esBuildConfig.loader = this.customEsBuildConfig.loader;
      }

      if (typeof this.customEsBuildConfig.assetNames == "string") {
        esBuildConfig.assetNames = this.customEsBuildConfig.assetNames;
      }

      if (typeof this.customEsBuildConfig.entryNames == "string") {
        esBuildConfig.entryNames = this.customEsBuildConfig.entryNames;
      }

      if (typeof this.customEsBuildConfig.publicPath == "string") {
        esBuildConfig.publicPath = this.customEsBuildConfig.publicPath;
      }

      if (Array.isArray(this.customEsBuildConfig.inject)) {
        esBuildConfig.inject = this.customEsBuildConfig.inject;
      }

      if (typeof this.customEsBuildConfig.format == "string") {
        esBuildConfig.format = this.customEsBuildConfig.format;
      }

      if (typeof this.customEsBuildConfig.splitting == "boolean") {
        esBuildConfig.splitting = this.customEsBuildConfig.splitting;
      }

      if (typeof this.customEsBuildConfig.bundle == "boolean") {
        esBuildConfig.bundle = this.customEsBuildConfig.bundle;
      }
    }

    if (!esBuildConfig.bundle) {
      delete esBuildConfig.external;
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
  async buildAndWatch(isPackaging: boolean, invokeName?: string) {
    const result = await build(this.esBuildConfig);
    const { outputs } = result.metafile!;
    this.#setLambdaEsOutputPaths(outputs);
    if (this.customBuildCallback) {
      await this.customBuildCallback(result);
    }

    if (!isPackaging && !invokeName) {
      this.listen(ServerlessAlbOffline.PORT, async (port: number, localIp: string) => {
        AlbRouter.PORT = port;
        await this.load(this.#lambdas);

        let output = `✅ AWS Lambda offline server is listening on http://localhost:${port}`;

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
        const zipOutputPath = await zip(path.slice(0, -3), l.outName);

        slsDeclaration.package = { ...slsDeclaration.package, disable: true, artifact: zipOutputPath };
      }
    }
  }

  async #onRebuild(error: any, result: any) {
    if (error) {
      log.RED("watch build failed:");
      console.error(error);
    } else {
      this.#setLambdaEsOutputPaths(result.metafile.outputs);

      if (this.customBuildCallback) {
        await this.customBuildCallback(result);
        await this.load(this.#lambdas);
      } else {
        await this.load(this.#lambdas);
        log.GREEN(`${new Date().toLocaleString()}🔄✅ Rebuild `);
      }
    }
  }
  #getAlbLambdas(invokeName?: string) {
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

      const slsDeclaration = this.serverless.service.getFunction(funcName);

      let lambdaDef = {
        name: funcName,
        outName: slsDeclaration.name,
        handlerPath,
        handlerName,
        esEntryPoint,
        memorySize: lambda.memorySize ?? this.runtimeConfig.memorySize ?? DEFAULT_LAMBDA_MEMORY_SIZE,
        timeout: lambda.timeout ?? this.runtimeConfig.timeout ?? DEFAULT_LAMBDA_TIMEOUT,
        endpoints: [],
        virtualEnvs: { ...this.defaultVirtualEnvs, ...(slsDeclaration.virtualEnvs ?? {}) },
        environment: {
          ...this.runtimeConfig.environment,
          ...lambda.environment,
          ...region,
          ...isLocalEnv,
        },
      };

      if (lambda.events.length) {
        lambdaDef.endpoints = lambda.events.map(this.#parseSlsEventDefinition).filter((x: any) => x);
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

  #parseSlsEventDefinition(event: any): LambdaEndpoint | null {
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
  #setLambdaEsOutputPaths(outputs: any) {
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

  async #setCustomEsBuildConfig() {
    if (!this.pluginConfig || typeof this.pluginConfig?.configPath !== "string") {
      return;
    }
    const setEnv = (lambdaName: string, key: string, value: string) => {
      const foundIndex = this.#lambdas.findIndex((x) => x.name == lambdaName);

      if (foundIndex > -1) {
        this.#lambdas[foundIndex].environment[key] = value;
        const slsDeclaration = this.serverless.service.getFunction(lambdaName);
        if (slsDeclaration) {
          if (!slsDeclaration.environment) {
            slsDeclaration.environment = {};
          }
          slsDeclaration.environment[key] = value;
        }
      }
    };
    const extPoint = this.pluginConfig.configPath.lastIndexOf(".");
    const customFilePath = this.pluginConfig.configPath.slice(0, extPoint);
    const configObjectName = this.pluginConfig.configPath.slice(extPoint + 1);

    const exportedFunc = require(path.resolve(cwd, customFilePath));

    if (!exportedFunc) {
      return;
    }

    const customConfigArgs = [this.#lambdas, this.isDeploying, setEnv];
    let exportedObject: any = {};

    if (typeof exportedFunc[configObjectName] == "function") {
      exportedObject = await exportedFunc[configObjectName](...customConfigArgs);
    } else if (typeof exportedFunc == "function") {
      exportedObject = await exportedFunc(...customConfigArgs);
    } else {
      return;
    }

    const customConfig = exportedObject.esbuild;
    let customEsBuild: any = {};
    if (Array.isArray(customConfig.plugins)) {
      customEsBuild.plugins = customConfig.plugins;
    }

    if (Array.isArray(customConfig.external)) {
      customEsBuild.external = customConfig.external;
    }

    if (typeof customConfig.sourcemap == "boolean") {
      customEsBuild.sourcemap = customConfig.sourcemap;
    }

    if (typeof customConfig.minify == "boolean") {
      customEsBuild.minify = customConfig.minify;
    }

    if (typeof customConfig.outdir == "string") {
      customEsBuild.outdir = customConfig.outdir;
    }

    if (typeof customConfig.outbase == "string") {
      customEsBuild.outbase = customConfig.outbase;
    }

    if (typeof customConfig.target == "string") {
      customEsBuild.target = customConfig.target;
    }

    if (typeof customConfig.tsconfig == "string") {
      customEsBuild.tsconfig = customConfig.tsconfig;
    }

    if (typeof customConfig.tsconfigRaw == "string") {
      // @ts-ignore
      customEsBuild.tsconfigRaw = customConfig.tsconfigRaw;
    }

    if (typeof customConfig.legalComments == "string") {
      customEsBuild.legalComments = customConfig.legalComments;
    }

    if (Array.isArray(customConfig.pure)) {
      customEsBuild.pure = customConfig.pure;
    }

    if (Array.isArray(customConfig.drop)) {
      customEsBuild.drop = customConfig.drop;
    }

    if (Array.isArray(customConfig.resolveExtensions)) {
      customEsBuild.resolveExtensions = customConfig.resolveExtensions;
    }

    if (typeof customConfig.ignoreAnnotations == "boolean") {
      customEsBuild.ignoreAnnotations = customConfig.ignoreAnnotations;
    }
    if (typeof customConfig.treeShaking == "boolean") {
      customEsBuild.treeShaking = customConfig.treeShaking;
    }

    if (customConfig.define && typeof customConfig.define == "object") {
      customEsBuild.define = customConfig.define;
    }

    if (customConfig.banner && typeof customConfig.banner == "object") {
      customEsBuild.banner = customConfig.banner;
    }
    if (customConfig.footer && typeof customConfig.footer == "object") {
      customEsBuild.footer = customConfig.footer;
    }
    if (customConfig.loader && typeof customConfig.loader == "object") {
      customEsBuild.loader = customConfig.loader;
    }

    if (typeof customConfig.assetNames == "string") {
      customEsBuild.assetNames = customConfig.assetNames;
    }
    if (typeof customConfig.entryNames == "string") {
      customEsBuild.entryNames = customConfig.entryNames;
    }

    if (typeof customConfig.publicPath == "string") {
      customEsBuild.publicPath = customConfig.publicPath;
    }

    if (typeof customConfig.format == "string") {
      customEsBuild.format = customConfig.format;
    }

    if (typeof customConfig.splitting == "boolean") {
      customEsBuild.splitting = customConfig.splitting;
    }
    if (typeof customConfig.bundle == "boolean") {
      customEsBuild.bundle = customConfig.bundle;
    }

    if (Array.isArray(customConfig.inject)) {
      customEsBuild.inject = customConfig.inject;
    }

    if (typeof exportedObject.buildCallback == "function") {
      this.customBuildCallback = exportedObject.buildCallback;
    }

    if (exportedObject.offline && typeof exportedObject.offline == "object") {
      if (Array.isArray(exportedObject.offline.request)) {
        this.customOfflineRequests = exportedObject.offline.request;
      }

      if (typeof exportedObject.offline.staticPath == "string") {
        this.serve = exportedObject.offline.staticPath;
      }
    }

    if (Object.keys(customEsBuild).length) {
      this.customEsBuildConfig = customConfig;
    }
  }
}

module.exports = ServerlessAlbOffline;
