import type { BuildOptions, BuildResult } from "esbuild";
import { IncomingMessage, ServerResponse } from "http";
import type { HttpMethod } from "./lib/handlers";
export interface OfflineConfig {
  staticPath?: string;
  port?: number;
  onReady?: (port: number) => Promise<void> | void;
  request?: {
    method?: HttpMethod | HttpMethod[];
    filter: string | RegExp;
    callback: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;
  }[];
}

export interface Config {
  esbuild?: Omit<BuildOptions, "entryPoints" | "outExtension" | "outfile" | "bundle" | "splitting" | "stdin" | "format" | "platforme" | "metafile">;
  offline?: OfflineConfig;
  buildCallback?: (result: BuildResult, isRebuild: boolean) => Promise<void> | void;
  afterDeployCallbacks?: (() => Promise<void> | void)[];
}

export interface ServerConfig {
  stage?: string;
  watch?: boolean;
  debug?: boolean;
  port?: number;
  onRebuild?: () => Promise<void> | void;
}
