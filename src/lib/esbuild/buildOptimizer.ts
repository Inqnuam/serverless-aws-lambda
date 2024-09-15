import type { Plugin, BuildResult } from "esbuild";
import { knownCjs } from "./knownCjs";

const awsSdkV2 = "aws-sdk";
const awsSdkV3 = "@aws-sdk/*";
const awslambda = `${__dirname.slice(0, -5)}/src/lib/runtime/awslambda.ts`;
const requirePoly = (nodePrefix: "node:" | "") =>
  `import { createRequire as __crE_ } from "${nodePrefix}module";import { fileURLToPath as __futP_ } from "${nodePrefix}url";import { dirname as __dN_ } from "${nodePrefix}path";global.__filename = __futP_(import.meta.url);global.__dirname = __dN_(__filename);global.require = __crE_(__filename);\n`;

export const buildOptimizer = ({
  isLocal,
  nodeVersion,
  shimRequire,
  includeAwsSdk,
  buildCallback,
}: {
  isLocal: boolean;
  nodeVersion: number;
  shimRequire: boolean;
  includeAwsSdk: boolean;
  buildCallback: (result: BuildResult, isRebuild: boolean, format: string, outdir: string) => void | Promise<void>;
}): Plugin => {
  return {
    name: "build-optimizer-plugin",
    setup(build) {
      let isRebuild = false;

      build.onEnd(async (result) => {
        if (!isRebuild && result?.errors?.length) {
          process.exit(1);
        }
        if (isRebuild) {
          // @ts-ignore
          globalThis.sco.forEach((socket) => {
            if (socket.writable) {
              socket.destroy();
            }
          });
        }
        try {
          await buildCallback(result, isRebuild, build.initialOptions.format!, build.initialOptions.outdir!);
        } catch (error) {
          console.log(error);
        }
        isRebuild = true;
      });

      if (isLocal) {
        if (Array.isArray(build.initialOptions.inject)) {
          build.initialOptions.inject.push(awslambda);
        } else {
          build.initialOptions.inject = [awslambda];
        }

        build.initialOptions.external!.push(...knownCjs);
      } else if (!includeAwsSdk) {
        build.initialOptions.external!.push(nodeVersion < 18 ? awsSdkV2 : awsSdkV3);
      }

      if (build.initialOptions.format != "esm") {
        return;
      }

      if (shimRequire) {
        const r = requirePoly(nodeVersion < 18 ? "" : "node:");
        if (build.initialOptions.banner) {
          if (build.initialOptions.banner.js) {
            build.initialOptions.banner.js = `${r}${build.initialOptions.banner.js}`;
          } else {
            build.initialOptions.banner.js = r;
          }
        } else {
          build.initialOptions.banner = {
            js: r,
          };
        }
      }
    },
  };
};
