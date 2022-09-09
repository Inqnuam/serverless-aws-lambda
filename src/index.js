const path = require("path");
const { ApplicationLoadBalancer } = require("./lib/alb.js");
const { log } = require("./lib/colorize.js");
const { zip } = require("./lib/zip.js");

const esbuild = require("esbuild");
const { nodeExternalsPlugin } = require("esbuild-node-externals");
const { handlebars } = require("./lib/handlebars.js");
const { ExpressLambda } = require("./lib/expressLambda.js");
const { Lambda } = require("./lib/index");

const cwd = process.cwd();
const DEFAULT_LAMBDA_TIMEOUT = 6;
const DEFAULT_LAMBDA_MEMORY_SIZE = 1024;
const isLocalEnv = {
  IS_OFFLINE: true,
  IS_LOCAL: true,
};

class ServerlessAlbOffline extends ApplicationLoadBalancer {
  #lambdas = [];
  watch = true;
  constructor(serverless, options) {
    super({ debug: process.env.SLS_DEBUG == "*" });
    this.serverless = serverless;
    this.options = options;

    this.pluginConfig = this.serverless.service.custom["serverless-alb-lambda"];

    this.PORT = this.options.p ?? this.options.port ?? this.pluginConfig?.port ?? process.env.PORT;

    this.#setWatchValue();

    if (this.pluginConfig?.tsconfig) {
      this.tsconfig = this.pluginConfig.tsconfig;
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
      "alb-lambda:run": this.init.bind(this),
      "before:package:createDeploymentArtifacts": this.init.bind(this, true),
      "before:deploy:deploy": this.init.bind(this, true),
      "before:invoke:local:invoke": this.invokeLocal.bind(this),
    };
  }

  async invokeLocal() {
    await this.init(false, this.options.function);
  }
  async init(isPackaging, invokeName) {
    this.#setEnvs();
    this.#lambdas = this.#getAlbLambdas(invokeName);
    this.#setEsBuildConfig(isPackaging, invokeName);
    await this.buildAndWatch(isPackaging, invokeName);
  }
  #setEsBuildConfig(isPackaging, invokeName) {
    const entryPoints = this.#lambdas.map((x) => x.esEntryPoint);

    const plugins = [handlebars(), ExpressLambda({ dev: !isPackaging })];

    let esBuildConfig = {
      platform: "node",
      sourcemap: !isPackaging,
      minify: isPackaging,
      metafile: true,
      target: "ES2018",
      entryPoints: entryPoints,
      outdir: path.join(cwd, ".alb_offline"),
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
  async buildAndWatch(isPackaging, invokeName) {
    const result = await esbuild.build(this.esBuildConfig);
    const { outputs } = result.metafile;
    this.#setLambdaEsOutputPaths(outputs);

    if (!isPackaging && !invokeName) {
      await this.load(this.#lambdas);
      this.listen(this.PORT);
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
  #getAlbLambdas(invokeName) {
    const funcs = this.serverless.service.functions;
    let functionsNames = Object.keys(funcs);

    if (invokeName) {
      functionsNames = functionsNames.filter((x) => x == invokeName);
    }
    const albs = functionsNames.reduce((accum, funcName) => {
      const lambda = funcs[funcName];
      const events = lambda.events?.filter((x) =>
        Object.keys(x)
          .map((x) => x.toLowerCase())
          .includes("alb")
      );

      if (!events.length) {
        return accum;
      }
      events.forEach((event) => {
        const alb = event?.alb;
        if (alb?.conditions && alb.conditions.path?.length && alb.conditions.method?.length) {
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
            path: alb.conditions.path[0],
            method: alb.conditions.method[0].toUpperCase(),
            memorySize: lambda.memorySize ?? this.runtimeConfig.memorySize ?? DEFAULT_LAMBDA_MEMORY_SIZE,
            timeout: lambda.timeout ?? this.runtimeConfig.timeout ?? DEFAULT_LAMBDA_TIMEOUT,
            environment: {
              ...this.runtimeConfig.environment,
              ...lambda.environment,
              ...region,
              ...isLocalEnv,
            },
          };

          accum.push(lambdaDef);
        }
      });

      return accum;
    }, []);

    return albs;
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

  #setEnvs() {
    const { environment, memorySize, timeout } = this.serverless.service.provider;

    this.runtimeConfig.memorySize = memorySize;
    this.runtimeConfig.timeout = timeout;
    this.runtimeConfig.environment = environment ?? {};
    this.runtimeConfig.environment.AWS_PROFILE = process.env.AWS_PROFILE;
  }
}

module.exports = ServerlessAlbOffline;
module.exports.Lambda = Lambda;
