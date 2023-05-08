import type { PluginBuild, BuildResult } from "esbuild";
import type { Config, OfflineConfig } from "./config";
import type { ILambdaMock } from "./lib/runtime/rapidApi";
import type { HttpMethod } from "./lib/server/handlers";
import type { IncomingMessage, ServerResponse } from "http";
import type Serverless from "serverless";
import { log } from "./lib/utils/colorize";
import { exitEvents } from "./server";

export type ILambda = {
  /**
   * Set environment varible.
   */
  setEnv: (key: string, value: string | null) => void;
  virtualEnvs?: {
    [key: string]: any;
  };
  /**
   * Be notified when this lambda is invoked.
   */
  onInvoke: (callback: (event: any, info?: any) => void) => void;
  onInvokeError: (callback: (input: any, error: any, info?: any) => void) => void;
  onInvokeSuccess: (callback: (input: any, output: any, info?: any) => void) => void;
} & Omit<ILambdaMock, "invokeSub" | "invokeSuccessSub" | "invokeErrorSub" | "runner">;

export interface ClientConfigParams {
  stop: (err?: any) => Promise<void>;
  lambdas: ILambda[];
  isDeploying: boolean;
  isPackaging: boolean;
  /**
   * @deprecated use `someLambda.setEnv(key, value)` instead.
   */
  setEnv: (lambdaName: string, key: string, value: string) => void;
  stage: string;
  esbuild: PluginBuild["esbuild"];
  config: Config;
  options: Options;
  serverless: Serverless;
  resources: {
    ddb: {};
    kinesis: {};
    sns: {};
    sqs: {};
  };
}

export interface OfflineRequest {
  /**
   * @default "ANY"
   */
  method?: HttpMethod | HttpMethod[];
  filter: string | RegExp;
  callback: (this: ClientConfigParams, req: IncomingMessage, res: ServerResponse) => Promise<any | void> | any | void;
}

export interface SlsAwsLambdaPlugin {
  name: string;
  buildCallback?: (this: ClientConfigParams, result: BuildResult, isRebuild: boolean) => Promise<void> | void;
  onInit?: (this: ClientConfigParams) => Promise<void> | void;
  onExit?: (this: ClientConfigParams, code: string | number) => void;
  afterDeploy?: (this: ClientConfigParams) => Promise<void> | void;
  offline?: {
    onReady?: (this: ClientConfigParams, port: number, ip: string) => Promise<void> | void;
    /**
     * Add new requests to the local server.
     */
    request?: OfflineRequest[];
  };
}

export interface Options {
  esbuild?: Config["esbuild"];
  offline?: {
    /**
     * Serve files locally from provided directory
     */
    staticPath?: string;
    port?: number;
  };
  plugins?: SlsAwsLambdaPlugin[];
}

let exiting = false;

const exitCallbacks: ((code: string | number) => void | Promise<void>)[] = [];

const exitCallback = (e: any) => {
  if (exiting) {
    return;
  }
  exiting = true;
  for (const cb of exitCallbacks) {
    try {
      cb(e);
    } catch (error) {
      console.log(error);
    }
  }
  process.exit();
};
exitEvents.forEach((e) => {
  process.on(e, exitCallback);
});

function defineConfig(options: Options) {
  // validate plugin names
  const pluginNames = new Set();

  if (options.plugins) {
    options.plugins = options.plugins.filter((plugin, index) => {
      if (!plugin) {
        return false;
      }
      if (!plugin.name || !plugin.name.length || typeof plugin.name != "string") {
        plugin.name = "plugin-" + index;
        log.YELLOW(`Invalid plugin name at index ${index}`);
      }
      const exists = pluginNames.has(plugin.name);
      if (exists) {
        plugin.name = plugin.name + index;
      } else {
        pluginNames.add(plugin.name);
      }
      return true;
    });
  }
  return async function config(
    this: ClientConfigParams,
    { stop, lambdas, isDeploying, isPackaging, setEnv, stage, esbuild, serverless, resources }: ClientConfigParams
  ): Promise<Omit<Config, "config" | "options">> {
    let config: Config = {
      esbuild: options.esbuild ?? {},
      offline: {
        staticPath: options.offline?.staticPath,
        port: options.offline?.port,
      },
      afterDeployCallbacks: [],
    };

    const self = {
      stop,
      lambdas,
      isDeploying,
      isPackaging,
      setEnv,
      stage,
      esbuild,
      serverless,
      options,
      config,
      resources,
    };
    if (options.plugins) {
      config.offline!.onReady = async (port, ip) => {
        for (const plugin of options.plugins!) {
          if (plugin.offline?.onReady) {
            try {
              await plugin.offline.onReady!.call(self, port, ip);
            } catch (error) {
              log.RED(plugin.name);
              console.error(error);
            }
          }
        }
      };

      config.buildCallback = async (result, isRebuild) => {
        for (const plugin of options.plugins!) {
          if (plugin.buildCallback) {
            try {
              await plugin.buildCallback.call(self, result, isRebuild);
            } catch (error) {
              log.RED(plugin.name);
              console.error(error);
            }
          }
        }
      };

      const pluginsRequests: OfflineConfig["request"] = options.plugins?.reduce((accum: OfflineConfig["request"], obj) => {
        if (obj.offline?.request?.length) {
          accum!.push(...obj.offline.request);
        }
        return accum;
      }, []);
      if (pluginsRequests?.length) {
        config.offline!.request = pluginsRequests.map((x) => {
          x.callback = x.callback.bind(self);

          return x;
        });
      }
      for (const plugin of options.plugins!) {
        if (plugin.onExit) {
          exitCallbacks.push(plugin.onExit.bind(self));
        }

        if (typeof plugin.afterDeploy == "function") {
          config.afterDeployCallbacks!.push(plugin.afterDeploy.bind(self));
        }
        if (plugin.onInit) {
          try {
            await plugin.onInit.call(self);
          } catch (error) {
            log.RED(plugin.name);
            console.error(error);
          }
        }
      }
    }

    if (!config.afterDeployCallbacks!.length) {
      delete config.afterDeployCallbacks;
    }
    return config;
  };
}
export { defineConfig };
export default defineConfig;
