import type { BuildOptions, BuildResult } from "esbuild";
import { IncomingMessage, ServerResponse } from "http";
import type { HttpMethod } from "./lib/server/handlers";
import type { awslambda } from "./lib/runtime/awslambda";
export interface OfflineConfig {
  staticPath?: string;
  port?: number;
  onReady?: (port: number, ip: string) => Promise<void> | void;
  request?: {
    method?: HttpMethod | HttpMethod[];
    filter: string | RegExp;
    callback: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;
  }[];
}

export interface Config {
  esbuild?: Omit<BuildOptions, "outExtension" | "outfile" | "bundle" | "splitting" | "stdin" | "platforme" | "metafile" | "format"> & { format?: "cjs" | "esm" };
  shimRequire?: boolean;
  includeAwsSdk?: boolean;
  server?: OfflineConfig;
  buildCallback?: (result: BuildResult, isRebuild: boolean) => Promise<void> | void;
  afterDeployCallbacks?: (() => Promise<void> | void)[];
  afterPackageCallbacks?: (() => Promise<void> | void)[];
  onKill?: (() => Promise<void> | void)[];
}

export interface ServerConfig {
  stage?: string;
  watch?: boolean;
  debug?: boolean;
  port?: number;
  onRebuild?: () => Promise<void> | void;
}

declare global {
  const awslambda: awslambda;
}
