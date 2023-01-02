import type { BuildOptions, BuildResult } from "esbuild";
import { IncomingMessage, ServerResponse } from "http";

export interface Config {
  esbuild?: BuildOptions;
  offline?: {
    staticPath?: string;
    port?: number;
    request?: {
      filter: RegExp;
      callback: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;
    }[];
  };
  buildCallback: (result: BuildResult) => Promise<void> | void;
}
