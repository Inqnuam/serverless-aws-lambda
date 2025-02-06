import path from "path";
import { Daemon } from "./lib/server/daemon";
import type { ILambdaMock } from "./lib/runtime/rapidApi";
import { log } from "./lib/utils/colorize";
import { Zipper } from "./lib/utils/zip";
import esbuild from "esbuild";
import type { BuildOptions, BuildResult, Metafile } from "esbuild";
import type Serverless from "serverless";
import { buildOptimizer } from "./lib/esbuild/buildOptimizer";
import { parseEvents, parseDestination } from "./lib/parseEvents/index";
import { getResources } from "./lib/parseEvents/getResources";
import { parseCustomEsbuild } from "./lib/esbuild/parseCustomEsbuild";
import { mergeEsbuildConfig } from "./lib/esbuild/mergeEsbuildConfig";
import { parseFuncUrl } from "./lib/parseEvents/funcUrl";
import { createLambdaRequestsHandlers } from "./plugins/lambda/index";
import { readDefineConfig } from "./lib/utils/readDefineConfig";
import { patchSchema } from "./lib/utils/schema";
import { AwsServices } from "./lib/services";
import type { SQSClientConfig } from "@aws-sdk/client-sqs";
import type { ILambdaFunction } from "./standalone_types";
import type { Config } from "./config";

const cwd = process.cwd();
const DEFAULT_LAMBDA_TIMEOUT = 3;
const DEFAULT_LAMBDA_MEMORY_SIZE = 1024;
const isLocalEnv = {
  IS_OFFLINE: true,
  IS_LOCAL: true,
  AWS_SAM_LOCAL: true,
};
const osRootPath = cwd.split(path.sep)[0];
const NsReg = new RegExp(`^.*:${osRootPath}`);
const isNamespacedPath = (p: string) => NsReg.test(p);

interface PluginUtils {
  log: Function;
  writeText: Function;
  progress: { get: Function; create: Function };
}

export class ServerlessAwsLambda extends Daemon {
  #lambdas: ILambdaMock[];
  watch = true;
  isDeploying = false;
  isPackaging = false;
  serverless: Serverless;
  options: any;
  stage: string;
  region: string;
  pluginConfig: any;
  commands: any;
  hooks: any;
  esBuildConfig: any;
  buildContext: any = {};
  customEsBuildConfig?: Config["esbuild"];
  defaultVirtualEnvs: any;
  nodeVersion: number | boolean | string | undefined = false;
  invokeName?: string;
  afterDeployCallbacks: (() => void | Promise<void>)[] = [];
  afterPackageCallbacks: (() => void | Promise<void>)[] = [];
  onKill: (() => Promise<void> | void)[] = [];
  resources: ReturnType<typeof getResources> = { ddb: {}, kinesis: {}, sns: {}, sqs: {} };
  shimRequire: boolean = false;
  includeAwsSdk: boolean = false;
  port: number = 0;
  onceServerReady: ((address: { port: number; url: string }) => void)[] = [];
  static tags: string[] = ["build"];
  constructor(serverless: any, options: any, pluginUtils: PluginUtils) {
    super({ debug: typeof options.debug == "boolean" ? options.debug : process.env.SLS_DEBUG == "*" });
    patchSchema(serverless);
    this.#lambdas = [];
    this.serverless = serverless;
    this.options = options;

    if (this.options.customEsBuildConfig) {
      this.customEsBuildConfig = this.options.customEsBuildConfig;
    }
    // @ts-ignore
    this.isPackaging = this.serverless.processedInput.commands.includes("package");
    // @ts-ignore
    this.isDeploying = this.serverless.processedInput.commands.includes("deploy");
    this.stage = this.options.stage ?? this.serverless.service.provider.stage ?? "dev";
    this.region = this.serverless.service.provider.region;

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

    if (this.serverless.service.custom) {
      this.pluginConfig = this.serverless.service.custom["serverless-aws-lambda"];
      this.defaultVirtualEnvs = this.serverless.service.custom["virtualEnvs"] ?? {};
    }

    this.commands = {
      "aws-lambda": {
        usage: "Mock AWS AWS-Lambda",
        lifecycleEvents: ["run"],
        options: {
          port: {
            usage: "Specify the server port (default: random free port)",
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
      "after:invoke:local:invoke": process.exit,
      "after:package:finalize": this.afterPackage.bind(this),
    };
  }

  async invokeLocal() {
    this.invokeName = this.options.function;
    this.watch = false;
    await this.init(false);
  }

  async afterDeploy() {
    for (const cb of this.afterDeployCallbacks) {
      try {
        await cb();
      } catch (error) {
        console.log(error);
        process.exit(1);
      }
    }
  }
  async afterPackage() {
    for (const cb of this.afterPackageCallbacks) {
      await cb();
    }
  }
  async init(isPackaging: boolean) {
    this.resources = getResources(this.serverless);
    this.#setRuntimeEnvs();
    this.#lambdas = this.#getLambdas();
    await this.#applyDefineConfig();
    this.setEsBuildConfig(isPackaging);
    await this.buildAndWatch();
  }
  excludeFunctions() {
    // @ts-ignore
    Object.entries(this.serverless.service.functions).forEach(([name, { online }]) => {
      const valType = typeof online;
      let mustSkip = false;
      if (valType == "boolean" && online === false) {
        mustSkip = true;
      } else if (valType == "string" && online != this.stage) {
        mustSkip = true;
      } else if (Array.isArray(online) && !online.includes(this.stage)) {
        mustSkip = true;
      }

      if (mustSkip) {
        console.log("Skipping", name);
        delete this.serverless.service.functions[name];
      }
    });
  }
  setEsBuildConfig = (isPackaging: boolean) => {
    const entryPoints = this.#lambdas.filter((x) => x.runtime.startsWith("n")).map((x) => x.esEntryPoint);

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
      dropLabels: [],
    };

    if (typeof process.env.NODE_ENV == "string") {
      esBuildConfig.logOverride = {
        "assign-to-define": "silent",
      };

      esBuildConfig.define = {
        "process.env.NODE_ENV": `"${process.env.NODE_ENV}"`,
      };
    }

    const isLocal = !this.isDeploying && !this.isPackaging;
    if (typeof this.nodeVersion == "string" && !isNaN(Number(this.nodeVersion))) {
      this.nodeVersion = Number(this.nodeVersion);
      if (Number(process.versions.node.slice(0, 2)) < this.nodeVersion) {
        log.RED(`You are running on NodeJS ${process.version} which is lower than '${this.nodeVersion}' found in serverless.yml.`);
      }
      esBuildConfig.target = `node${this.nodeVersion}`;

      const getSockets = () => this.sco;
      esBuildConfig.plugins?.push(
        buildOptimizer({ isLocal, nodeVersion: this.nodeVersion, shimRequire: this.shimRequire, includeAwsSdk: this.includeAwsSdk, buildCallback: this.buildCallback, getSockets })
      );
    }
    if (!isLocal) {
      esBuildConfig.dropLabels!.push("LOCAL");
    }
    if (this.customEsBuildConfig) {
      esBuildConfig = mergeEsbuildConfig(esBuildConfig, this.customEsBuildConfig);
    }

    this.esBuildConfig = esBuildConfig;
    if (isLocal && this.customEsBuildConfig) {
      const { sourcemap } = this.customEsBuildConfig;
      if (this.esBuildConfig.publicPath) {
        if (sourcemap == "inline" || sourcemap == "both") {
          return;
        }
      } else if (sourcemap != "external") {
        return;
      }

      // @ts-ignore dont care
      this.esBuildConfig.sourcemap = sourcemap == "inline" ? "inline" : "both";
    }
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

  buildCallback = async (result: BuildResult, isRebuild: boolean, format: string, outdir: string) => {
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

        if (foundLambda && foundLambda.runtime.startsWith("n")) {
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

        const zipper = new Zipper(this.serverless, format, this.esBuildConfig.sourcemap, outputs, outdir);

        try {
          await Promise.all(packageLambdas.filter((x) => x.runtime.startsWith("n")).map(zipper.zipHandler));
        } catch (error) {
          console.error(error);
          process.exit(1);
        }
      } else {
        this.#setPort();
        const self = this;
        const server = (await new Promise((r) => {
          this.listen(this.port, async (port: number, localIp: string) => {
            // console.log("Load lambdas", self.#lambdas);
            await self.load(self.#lambdas);

            const url = `http://localhost:${port}`;
            let output = `✅ AWS Lambda local server is listening on ${url}`;

            if (localIp) {
              output += ` | http://${localIp}:${port}`;
            }

            self.#lambdas.forEach((x) => {
              // @ts-ignore
              x.setEnv("LOCAL_PORT", port);
              // @ts-ignore
              x.setEnv("AWS_LAMBDA_RUNTIME_API", `127.0.0.1:${port}`);
            });

            // @ts-ignore
            self.setApiKeys(self.serverless.service.provider.apiGateway?.apiKeys);

            console.log(`\x1b[32m${output}\x1b[0m`);
            r({ url, port });
          });
        })) as { port: number; url: string };

        this.onceServerReady.forEach((cb) => {
          cb(server);
        });
      }
    }
  };

  async #onRebuild(result: BuildResult) {
    if (result?.errors?.length) {
      log.RED("build failed:");
      console.error(result.errors);
    } else {
      this.#setLambdaEsOutputPaths(result.metafile!.outputs);

      try {
        if (this.customBuildCallback) {
          await this.customBuildCallback(result, true);
        }
        await this.load(this.#lambdas);
      } catch (error) {
        console.error(error);
      }
      console.log(`\x1b[32m${new Date().toLocaleString()} 🔄✅ Rebuild\x1b[0m`);
      process.send?.({ rebuild: true });
    }
  }

  #getLambdaDef(funcName: string) {
    const provider = this.serverless.service.provider;
    const defaultRuntime = provider.runtime;
    // @ts-ignore
    const defaultHttpApiPayload: 1 | 2 = provider.httpApi?.payload == "1.0" ? 1 : 2;

    // @ts-ignore
    const Outputs = this.serverless.service.resources?.Outputs;
    const region = this.runtimeConfig.environment.AWS_REGION ?? this.runtimeConfig.environment.REGION;

    const funcs = this.serverless.service.functions;
    const lambda = funcs[funcName];

    const handlerPath = (lambda as Serverless.FunctionDefinitionHandler).handler;
    const ext = path.extname(handlerPath);
    const handlerName = ext.slice(1);
    const esEntryPoint = path.resolve(handlerPath.replace(ext, ""));

    const slsDeclaration: any = this.serverless.service.getFunction(funcName);
    const runtime = slsDeclaration.runtime ?? defaultRuntime;

    let lambdaDef: any = {
      name: funcName,
      outName: slsDeclaration.name,
      runtime: slsDeclaration.runtime ?? defaultRuntime,
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
      documentDb: [],
      virtualEnvs: { ...this.defaultVirtualEnvs, ...(slsDeclaration.virtualEnvs ?? {}) },
      online: typeof slsDeclaration.online == "boolean" ? slsDeclaration.online : true,
      environment: {
        AWS_EXECUTION_ENV: `AWS_Lambda_${runtime}`,
        AWS_LAMBDA_FUNCTION_VERSION: "$LATEST",
        AWS_LAMBDA_FUNCTION_NAME: funcName,
        _HANDLER: path.basename(handlerPath),
        ...this.runtimeConfig.environment,
        ...lambda.environment,
        ...isLocalEnv,
      },
      invoke: async (event: any, info?: any) => {
        const foundLambda = this.getHandlerByName(`/@invoke/${funcName}`);
        if (foundLambda) {
          const res = await foundLambda.invoke(event, info);
          return res;
        } else {
          log.RED(`'${funcName}' is not mounted yet.\nPlease invoke it after the initial build is completed.`);
          return;
        }
      },
      invokeSub: [],
      invokeSuccessSub: [],
      invokeErrorSub: [],
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
    lambdaDef.onInvokeSuccess = (callback: (event: any, info?: any) => void) => {
      lambdaDef.invokeSuccessSub.push(callback);
    };
    lambdaDef.onInvokeError = (callback: (event: any, info?: any) => void) => {
      lambdaDef.invokeErrorSub.push(callback);
    };

    if (process.env.NODE_ENV) {
      lambdaDef.environment.NODE_ENV = process.env.NODE_ENV;
    }
    if (region) {
      lambdaDef.environment.AWS_REGION = region;
      lambdaDef.environment.AWS_DEFAULT_REGION = region;
    }

    lambdaDef.environment.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = lambdaDef.memorySize;
    lambdaDef.url = parseFuncUrl(lambda);
    if (lambda.events.length) {
      let httpApiPayload = defaultHttpApiPayload;
      if (typeof slsDeclaration.httpApi?.payload == "string") {
        const { payload } = slsDeclaration.httpApi;
        httpApiPayload = payload == "1.0" ? 1 : payload == "2.0" ? 2 : defaultHttpApiPayload;
      }
      const { endpoints, sns, sqs, ddb, s3, kinesis, documentDb } = parseEvents({ events: lambda.events, Outputs, resources: this.resources, httpApiPayload, provider });
      lambdaDef.endpoints = endpoints;
      lambdaDef.sns = sns;
      lambdaDef.sqs = sqs;
      lambdaDef.ddb = ddb;
      lambdaDef.s3 = s3;
      lambdaDef.kinesis = kinesis;
      lambdaDef.documentDb = documentDb;
    }

    return lambdaDef;
  }

  #getLambdas() {
    const funcs = this.serverless.service.functions;
    let functionsNames = Object.keys(funcs);

    if (this.invokeName) {
      functionsNames = functionsNames.filter((x) => x == this.invokeName);
    }

    const lambdas = functionsNames.reduce((accum: any[], funcName: string) => {
      const lambdaDef = this.#getLambdaDef(funcName);
      accum.push(lambdaDef);
      return accum;
    }, []);

    return lambdas;
  }
  #setLambdaEsOutputPaths(outputs: Metafile["outputs"]) {
    const outputNames = Object.keys(outputs)
      .filter((x) => !x.endsWith(".map") && outputs[x].entryPoint)
      .map((x) => {
        const element = outputs[x] as Metafile["outputs"][string] & { entryPoint: string };

        let actuelEntryPoint = element.entryPoint;
        let ext = "";

        if (isNamespacedPath(actuelEntryPoint)) {
          actuelEntryPoint = actuelEntryPoint.split(":").slice(1).join(":");
        }

        if (!path.isAbsolute(actuelEntryPoint)) {
          actuelEntryPoint = path.resolve(actuelEntryPoint);
        }

        const lastPointIndex = actuelEntryPoint.lastIndexOf(".");

        if (lastPointIndex != -1) {
          ext = path.extname(actuelEntryPoint);
          actuelEntryPoint = actuelEntryPoint.slice(0, lastPointIndex);
        }

        return {
          esOutputPath: path.join(cwd, x),
          entryPoint: actuelEntryPoint,
          ext,
        };
      });

    this.#lambdas.forEach((x) => {
      const foundOutput = outputNames.find((w) => w?.entryPoint == x.esEntryPoint);

      if (foundOutput) {
        x.esOutputPath = foundOutput.esOutputPath;
        x.entryPoint = `${foundOutput.entryPoint}${foundOutput.ext}`;
      }
    });
  }

  #setRuntimeEnvs() {
    const { environment, memorySize, timeout } = this.serverless.service.provider as any;

    this.runtimeConfig.memorySize = memorySize;
    this.runtimeConfig.timeout = timeout;
    this.runtimeConfig.environment = environment ? { ...environment } : {};
    const awsEnvKeys = Object.keys(process.env).filter((x) => x.startsWith("AWS_"));

    awsEnvKeys.forEach((x: string) => {
      this.runtimeConfig.environment[x] = process.env[x] as string;
    });
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
      log.RED(`Can not set env variable '${key}' on '${lambdaName}'`);
    }
  }

  async #applyDefineConfig() {
    const customConfigArgs = {
      stop: async (cb?: (err?: any) => void) => {
        if (this.buildContext.stop) {
          await this.buildContext.stop();
        }
        this.stop(cb);
      },
      lambdas: this.#lambdas,
      isDeploying: this.isDeploying,
      isPackaging: this.isPackaging,
      setEnv: (n: string, k: string, v: string) => {
        this.setEnv(n, k, v);
      },
      addLambda: (func: ILambdaFunction) => {
        if (!func.events) {
          func.events = [];
        } else if (!Array.isArray(func.events)) {
          throw new Error("Lambda 'events' must be an array when defined");
        }

        // @ts-ignore
        this.serverless.service.functions[func.name] = func;

        this.#lambdas.push(this.#getLambdaDef(func.name));
      },
      stage: this.stage,
      region: this.region,
      esbuild: esbuild,
      serverless: this.serverless,
      resources: this.resources,
      getServices() {
        return {
          sqs: AwsServices.sqs,
        };
      },
      setServices: async ({ sqs }: { sqs?: SQSClientConfig }) => {
        if (sqs) {
          await AwsServices.setSqsClient(sqs);
        }
      },
    };

    const customOfflineRequests = createLambdaRequestsHandlers(this.handlers).map((x) => {
      // @ts-ignore
      x.callback = x.callback.bind(customConfigArgs);
      return x;
    });

    let exportedObject: any = {};

    const definedConfig = await readDefineConfig(this.pluginConfig?.configPath);
    if (definedConfig && definedConfig.exportedFunc) {
      const { exportedFunc, configObjectName, configPath } = definedConfig;

      if (typeof exportedFunc[configObjectName] == "function") {
        exportedObject = await exportedFunc[configObjectName](customConfigArgs);
      } else if (typeof exportedFunc == "function") {
        exportedObject = await exportedFunc(customConfigArgs);
      } else if (typeof exportedFunc.default == "function") {
        exportedObject = await exportedFunc.default(customConfigArgs);
      } else {
        throw new Error(`Can not find config at: ${configPath}`);
      }

      if (Array.isArray(exportedObject.onKill)) {
        this.onKill.push(...exportedObject.onKill);
      }
      if (typeof exportedObject.shimRequire == "boolean") {
        this.shimRequire = exportedObject.shimRequire;
      }

      if (typeof exportedObject.includeAwsSdk == "boolean") {
        this.includeAwsSdk = exportedObject.includeAwsSdk;
      }

      if (typeof exportedObject.buildCallback == "function") {
        this.customBuildCallback = exportedObject.buildCallback;
      }

      if (Array.isArray(exportedObject.afterDeployCallbacks)) {
        this.afterDeployCallbacks = exportedObject.afterDeployCallbacks;
      }

      if (Array.isArray(exportedObject.afterPackageCallbacks)) {
        this.afterPackageCallbacks = exportedObject.afterPackageCallbacks;
      }

      if (exportedObject.server && typeof exportedObject.server == "object") {
        if (Array.isArray(exportedObject.server.request)) {
          customOfflineRequests.unshift(...exportedObject.server.request);
        }

        if (typeof exportedObject.server.staticPath == "string") {
          this.serve = exportedObject.server.staticPath;
        }
        if (typeof exportedObject.server.port == "number" && !this.port) {
          this.port = exportedObject.server.port;
        }

        if (typeof exportedObject.server.onReady == "function") {
          this.onReady = exportedObject.server.onReady;
        }
      }
    }
    this.customOfflineRequests = customOfflineRequests;
    const customConfig = exportedObject.esbuild;
    if (!customConfig) {
      return;
    }

    const customEsBuild = parseCustomEsbuild(customConfig);
    if (Object.keys(customEsBuild).length) {
      if (!this.customEsBuildConfig) {
        this.customEsBuildConfig = customEsBuild;
      } else {
        this.customEsBuildConfig = { ...this.customEsBuildConfig, ...customEsBuild };
      }
    }
  }

  #setPort = () => {
    if (this.pluginConfig && !isNaN(this.pluginConfig.port)) {
      this.port = this.pluginConfig.port;
    }

    const cmdPort = this.options.p ?? this.options.port;
    if (!isNaN(cmdPort)) {
      this.port = cmdPort;
    }

    const processPort = Number(process.env.PORT);

    if (!isNaN(processPort)) {
      this.port = processPort;
    }
  };

  async kill() {
    // stop listenting new requests
    this.stop();

    // stop esbuild
    if (this.buildContext.stop) {
      await this.buildContext.stop();
    }

    // kill mounted Lambdas
    this.handlers.forEach((x) => {
      // @ts-ignore
      x.clear?.();
    });

    for (const kill of this.onKill) {
      await kill();
    }
  }
}
