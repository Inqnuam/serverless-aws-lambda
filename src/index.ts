import path from "path";
import { Daemon } from "./lib/server/daemon";
import { ILambdaMock } from "./lib/runtime/lambdaMock";
import { log } from "./lib/utils/colorize";
import { zip } from "./lib/utils/zip";
import esbuild from "esbuild";
import type { BuildOptions, BuildResult } from "esbuild";
import type Serverless from "serverless";
import { Handlers } from "./lib/server/handlers";
import { buildOptimizer } from "./lib/esbuild/buildOptimizer";
import { parseEvents, parseDestination } from "./lib/parseEvents/index";
import { getResources } from "./lib/parseEvents/getResources";
import { parseCustomEsbuild } from "./lib/esbuild/parseCustomEsbuild";
import { mergeEsbuildConfig } from "./lib/esbuild/mergeEsbuildConfig";
const cwd = process.cwd();
const DEFAULT_LAMBDA_TIMEOUT = 6;
const DEFAULT_LAMBDA_MEMORY_SIZE = 1024;
const isLocalEnv = {
  IS_OFFLINE: true,
  IS_LOCAL: true,
};

class ServerlessAwsLambda extends Daemon {
  #lambdas: ILambdaMock[];
  watch = true;
  isDeploying = false;
  isPackaging = false;
  serverless: Serverless;
  options: any;
  pluginConfig: any;
  tsconfig: any;
  commands: any;
  hooks: any;
  esBuildConfig: any;
  buildContext: any = {};
  customEsBuildConfig: any;
  customBuildCallback?: Function;
  defaultVirtualEnvs: any;
  nodeVersion: number | boolean | string | undefined = false;
  invokeName?: string;
  afterDeployCallbacks: (() => void | Promise<void>)[] = [];
  resources: {
    ddb: {};
    kinesis: {};
    sns: {};
    sqs: {};
  };
  constructor(serverless: any, options: any) {
    super({ debug: process.env.SLS_DEBUG == "*" });

    this.#lambdas = [];
    this.serverless = serverless;
    this.options = options;
    // @ts-ignore
    this.isPackaging = this.serverless.processedInput.commands.includes("package");
    // @ts-ignore
    this.isDeploying = this.serverless.processedInput.commands.includes("deploy");

    if (!this.serverless.service.provider.runtime) {
      throw new Error("Please provide 'runtime' inside your serverless.yml > provider > runtime");
    } else if (this.serverless.service.provider.runtime.startsWith("node")) {
      this.nodeVersion = this.serverless.service.provider.runtime?.replace(/[^0-9]/g, "");
    } else {
      this.nodeVersion = "14";
    }
    this.watch = !this.isPackaging && !this.isDeploying;
    if (!this.watch) {
      log.BR_BLUE("Packaging using serverless-aws-lambda...");
    } else {
      log.BR_BLUE("Launching serverless-aws-lambda...");
    }
    serverless.configSchemaHandler.defineFunctionProperties("aws", {
      properties: {
        virtualEnvs: { type: "object" },
        online: { type: "boolean" },
        files: { type: "array" },
      },
    });

    if (this.serverless.service.custom) {
      this.pluginConfig = this.serverless.service.custom["serverless-aws-lambda"];
      this.defaultVirtualEnvs = this.serverless.service.custom["virtualEnvs"] ?? {};
      ServerlessAwsLambda.PORT = this.pluginConfig?.port;
    }

    const cmdPort = this.options.p ?? this.options.port;
    if (cmdPort) {
      ServerlessAwsLambda.PORT = cmdPort;
    }

    const processPort = Number(process.env.PORT);

    if (!isNaN(processPort)) {
      ServerlessAwsLambda.PORT = processPort;
    }

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
      "aws-lambda:run": this.init.bind(this),
      "before:package:initialize": this.excludeFunctions.bind(this),
      "before:package:createDeploymentArtifacts": this.init.bind(this, true),
      "before:deploy:function:packageFunction": this.init.bind(this, true),
      "before:invoke:local:invoke": this.invokeLocal.bind(this),
      "after:aws:deploy:finalize:cleanup": this.afterDeploy.bind(this),
    };

    this.resources = getResources(this.serverless);
  }

  async invokeLocal() {
    this.invokeName = this.options.function;
    await this.init(false);
  }

  async afterDeploy() {
    for (const cb of this.afterDeployCallbacks) {
      try {
        await cb();
      } catch (error) {
        console.log(error);
      }
    }
  }
  async init(isPackaging: boolean) {
    this.#setRuntimeEnvs();
    this.#lambdas = this.#getLambdas();
    await this.#setCustomEsBuildConfig();
    this.setEsBuildConfig(isPackaging);
    await this.buildAndWatch();
  }
  excludeFunctions() {
    // @ts-ignore
    Object.entries(this.serverless.service.functions).forEach(([name, { online }]) => {
      if (typeof online == "boolean" && online === false) {
        delete this.serverless.service.functions[name];
      }
    });
  }
  setEsBuildConfig = (isPackaging: boolean) => {
    const entryPoints = this.#lambdas.map((x) => x.esEntryPoint);

    let esBuildConfig: BuildOptions = {
      sourcemap: !isPackaging,
      minify: isPackaging,
      entryPoints: entryPoints,
      outdir: path.join(cwd, ".aws_lambda"),
      metafile: true,
      bundle: true,
      platform: "node",
      target: "es2018",
      format: "cjs",
      outbase: "src",
      plugins: [],
      external: ["esbuild"],
    };

    if (typeof this.nodeVersion == "string" && !isNaN(Number(this.nodeVersion))) {
      this.nodeVersion = Number(this.nodeVersion);
      if (Number(process.versions.node.slice(0, 2)) < Number(this.nodeVersion)) {
        log.RED(`You are running on NodeJS ${process.version} which is lower than '${this.nodeVersion}' found in serverless.yml.`);
      }
      esBuildConfig.target = `node${this.nodeVersion}`;
      esBuildConfig.plugins?.push(buildOptimizer({ isLocal: !this.isDeploying && !this.isPackaging, nodeVersion: this.nodeVersion, buildCallback: this.buildCallback }));
    }

    if (this.customEsBuildConfig) {
      esBuildConfig = mergeEsbuildConfig(esBuildConfig, this.customEsBuildConfig);
    }

    this.esBuildConfig = esBuildConfig;
  };

  async buildAndWatch() {
    if (this.watch) {
      const ctx = await esbuild.context(this.esBuildConfig);
      await ctx.watch();
      this.buildContext.stop = ctx.dispose;
    } else {
      await esbuild.build(this.esBuildConfig);
    }
  }

  buildCallback = async (result: BuildResult, isRebuild: boolean) => {
    if (isRebuild) {
      await this.#onRebuild(result);
    } else {
      const { outputs } = result.metafile!;
      this.#setLambdaEsOutputPaths(outputs);
      if (this.customBuildCallback) {
        try {
          await this.customBuildCallback(result, false);
        } catch (error) {
          console.log(error);
        }
      }

      if (this.invokeName) {
        const slsDeclaration = this.serverless.service.getFunction(this.invokeName);
        const foundLambda = this.#lambdas.find((x) => x.name == this.invokeName);

        if (foundLambda) {
          (slsDeclaration as Serverless.FunctionDefinitionHandler).handler = foundLambda.esOutputPath.replace(`${cwd}/`, "").replace(".js", `.${foundLambda.handlerName}`);
        }
      } else if (this.isDeploying || this.isPackaging) {
        let packageLambdas: ILambdaMock[] = this.#lambdas;

        if (this.options.function) {
          const foundLambda = this.#lambdas.find((x) => x.name == this.options.function);

          if (foundLambda) {
            packageLambdas = [foundLambda];
          }
        }
        // TODO: convert to promise all
        for (const l of packageLambdas.filter((x) => x.online)) {
          const slsDeclaration = this.serverless.service.getFunction(l.name) as Serverless.FunctionDefinitionHandler;

          if (typeof slsDeclaration.package?.artifact == "string") {
            continue;
          }

          // @ts-ignore
          const filesToInclude = slsDeclaration.files;
          const zipableBundledFilePath = l.esOutputPath.slice(0, -3);
          const zipOutputPath = await zip(zipableBundledFilePath, l.outName, filesToInclude);

          // @ts-ignore
          slsDeclaration.package = { ...slsDeclaration.package, disable: true, artifact: zipOutputPath };
          slsDeclaration.handler = path.basename(l.handlerPath);
        }
      } else {
        this.listen(ServerlessAwsLambda.PORT, async (port: number, localIp: string) => {
          Handlers.PORT = port;
          await this.load(this.#lambdas);

          let output = `✅ AWS Lambda offline server is listening on http://localhost:${port}`;

          if (localIp) {
            output += ` | http://${localIp}:${port}`;
          }

          // @ts-ignore
          this.#lambdas.forEach((x) => x.setEnv("LOCAL_PORT", port));
          log.GREEN(output);
        });
      }
    }
  };

  async #onRebuild(result: BuildResult) {
    if (result?.errors?.length) {
      log.RED("watch build failed:");
      console.error(result.errors);
    } else {
      this.#setLambdaEsOutputPaths(result.metafile!.outputs);

      try {
        if (this.customBuildCallback) {
          await this.customBuildCallback(result, true);
          await this.load(this.#lambdas);
        } else {
          await this.load(this.#lambdas);
        }
      } catch (error) {
        console.error(error);
      }

      log.GREEN(`${new Date().toLocaleString()} 🔄✅ Rebuild `);
      process.send?.({ rebuild: true });
    }
  }
  #getLambdas() {
    const funcs = this.serverless.service.functions;
    let functionsNames = Object.keys(funcs);

    if (this.invokeName) {
      functionsNames = functionsNames.filter((x) => x == this.invokeName);
    }
    const defaultRuntime = this.serverless.service.provider.runtime;

    // @ts-ignore
    const Outputs = this.serverless.service.resources?.Outputs;
    const lambdas = functionsNames.reduce((accum: any[], funcName: string) => {
      const lambda = funcs[funcName];

      if (lambda.runtime && !lambda.runtime.startsWith("node")) {
        return accum;
      } else if (!defaultRuntime?.startsWith("node") && (!lambda.runtime || !lambda.runtime.startsWith("node"))) {
        return accum;
      }
      const handlerPath = (lambda as Serverless.FunctionDefinitionHandler).handler;
      const ext = path.extname(handlerPath);
      const handlerName = ext.slice(1);
      const esEntryPoint = path.posix.resolve(handlerPath.replace(ext, ""));

      const region = this.runtimeConfig.environment.AWS_REGION ?? this.runtimeConfig.environment.REGION;

      const slsDeclaration: any = this.serverless.service.getFunction(funcName);

      let lambdaDef: any = {
        name: funcName,
        outName: slsDeclaration.name,
        handlerPath,
        handlerName,
        esEntryPoint,
        memorySize: lambda.memorySize ?? this.runtimeConfig.memorySize ?? DEFAULT_LAMBDA_MEMORY_SIZE,
        timeout: lambda.timeout ?? this.runtimeConfig.timeout ?? DEFAULT_LAMBDA_TIMEOUT,
        endpoints: [],
        sns: [],
        sqs: [],
        ddb: [],
        s3: [],
        kinesis: [],
        virtualEnvs: { ...this.defaultVirtualEnvs, ...(slsDeclaration.virtualEnvs ?? {}) },
        online: typeof slsDeclaration.online == "boolean" ? slsDeclaration.online : true,
        environment: {
          AWS_EXECUTION_ENV: `AWS_Lambda_nodejs${this.nodeVersion}.x`,
          AWS_LAMBDA_FUNCTION_VERSION: "$LATEST",
          AWS_LAMBDA_FUNCTION_NAME: funcName,
          _HANDLER: path.basename(handlerPath),
          ...this.runtimeConfig.environment,
          ...lambda.environment,
          ...isLocalEnv,
        },
        invoke: async (event: any, info?: any) => {
          const foundLambda = Handlers.getHandlerByName(`/@invoke/${funcName}`);
          if (foundLambda) {
            const res = await foundLambda.invoke(event, info);
            return res;
          } else {
            log.RED(`'${funcName}' is not mounted yet.\nPlease invoke it after the initial build is completed.`);
            return;
          }
        },
        invokeSub: [],
        setEnv: (key: string, value: string) => {
          this.setEnv(funcName, key, value);
        },
      };

      // @ts-ignore
      lambdaDef.onError = parseDestination(lambda.onError, Outputs, this.resources);

      if (lambdaDef.onError?.kind == "lambda") {
        log.YELLOW("Dead-Letter queue could only be a SNS or SQS service");
        delete lambdaDef.onError;
      }
      //@ts-ignore
      if (lambda.destinations && typeof lambda.destinations == "object") {
        //@ts-ignore
        lambdaDef.onFailure = parseDestination(lambda.destinations.onFailure, Outputs, this.resources);
        //@ts-ignore
        lambdaDef.onSuccess = parseDestination(lambda.destinations.onSuccess, Outputs, this.resources);
      }

      lambdaDef.onInvoke = (callback: (event: any, info?: any) => void) => {
        lambdaDef.invokeSub.push(callback);
      };

      if (process.env.NODE_ENV) {
        lambdaDef.environment.NODE_ENV = process.env.NODE_ENV;
      }
      if (region) {
        lambdaDef.environment.AWS_REGION = region;
        lambdaDef.environment.AWS_DEFAULT_REGION = region;
      }

      lambdaDef.environment.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = lambdaDef.memorySize;

      if (lambda.events.length) {
        const { endpoints, sns, sqs, ddb, s3, kinesis } = parseEvents(lambda.events, Outputs, this.resources);
        lambdaDef.endpoints = endpoints;
        lambdaDef.sns = sns;
        lambdaDef.sqs = sqs;
        lambdaDef.ddb = ddb;
        lambdaDef.s3 = s3;
        lambdaDef.kinesis = kinesis;
      }
      // console.log(lambdaDef);
      accum.push(lambdaDef);
      return accum;
    }, []);

    return lambdas;
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
    const { environment, memorySize, timeout } = this.serverless.service.provider as any;

    this.runtimeConfig.memorySize = memorySize;
    this.runtimeConfig.timeout = timeout;
    this.runtimeConfig.environment = environment ?? {};

    if (process.env.AWS_PROFILE) {
      this.runtimeConfig.environment.AWS_PROFILE = process.env.AWS_PROFILE;
    }
  }

  setEnv(lambdaName: string, key: string, value: string) {
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
    } else {
      log.RED(`Can not set env var on '${lambdaName}'`);
    }
  }
  async #setCustomEsBuildConfig() {
    if (!this.pluginConfig || typeof this.pluginConfig?.configPath !== "string") {
      return;
    }

    const parsed = path.posix.parse(this.pluginConfig.configPath);

    const customFilePath = path.posix.join(parsed.dir, parsed.name);
    const configObjectName = parsed.ext.slice(1);
    const configPath = path.resolve(customFilePath);

    const exportedFunc = require(configPath);

    if (!exportedFunc) {
      return;
    }

    const customConfigArgs = {
      stop: async (cb: (err?: any) => void) => {
        this.stop(cb);
        if (this.buildContext.stop) {
          await this.buildContext.stop();
        }
      },
      lambdas: this.#lambdas,
      isDeploying: this.isDeploying,
      isPackaging: this.isPackaging,
      setEnv: (n: string, k: string, v: string) => {
        this.setEnv(n, k, v);
      },
      port: ServerlessAwsLambda.PORT,
      stage: this.options.stage ?? this.serverless.service.provider.stage ?? "dev",
      esbuild: esbuild,
      serverless: this.serverless,
      resources: this.resources,
    };
    let exportedObject: any = {};

    if (typeof exportedFunc[configObjectName] == "function") {
      exportedObject = await exportedFunc[configObjectName](customConfigArgs);
    } else if (typeof exportedFunc == "function") {
      exportedObject = await exportedFunc(customConfigArgs);
    } else {
      throw new Error(`Can not find config at: ${configPath}`);
    }

    if (typeof exportedObject.buildCallback == "function") {
      this.customBuildCallback = exportedObject.buildCallback;
    }

    if (Array.isArray(exportedObject.afterDeployCallbacks)) {
      this.afterDeployCallbacks = exportedObject.afterDeployCallbacks;
    }

    if (exportedObject.offline && typeof exportedObject.offline == "object") {
      if (Array.isArray(exportedObject.offline.request)) {
        this.customOfflineRequests.push(...exportedObject.offline.request);
      }

      if (typeof exportedObject.offline.staticPath == "string") {
        this.serve = exportedObject.offline.staticPath;
      }
      if (typeof exportedObject.offline.port == "number") {
        ServerlessAwsLambda.PORT = exportedObject.offline.port;
      }

      if (typeof exportedObject.offline.onReady == "function") {
        this.onReady = exportedObject.offline.onReady;
      }
    }

    const customConfig = exportedObject.esbuild;
    if (!customConfig) {
      return;
    }

    const customEsBuild = parseCustomEsbuild(customConfig);
    if (Object.keys(customEsBuild).length) {
      this.customEsBuildConfig = customEsBuild;
    }
  }
}

module.exports = ServerlessAwsLambda;
