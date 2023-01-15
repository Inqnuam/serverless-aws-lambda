import type { BuildOptions, BuildResult } from "esbuild";
import { IncomingMessage, ServerResponse } from "http";

export interface Config {
  esbuild?: Omit<BuildOptions, "entryPoints" | "outExtension" | "outfile" | "bundle" | "splitting" | "stdin" | "format">;
  offline?: {
    staticPath?: string;
    port?: number;
    onReady?: (port: number) => Promise<void> | void;
    request?: {
      filter: RegExp;
      callback: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;
    }[];
  };
  buildCallback?: (result: BuildResult, isRebuild: boolean) => Promise<void> | void;
}

export interface ServerConfig {
  stage?: string;
  watch?: boolean;
  debug?: boolean;
  port?: number;
  onRebuild?: () => Promise<void> | void;
}
