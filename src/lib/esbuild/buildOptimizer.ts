import type { Plugin, BuildResult } from "esbuild";
import { knownCjs } from "./knownCjs";

const awsSdkV2 = "aws-sdk";
const awsSdkV3 = "@aws-sdk/*";
const awslambda = `${__dirname.slice(0, -5)}/src/lib/runtime/awslambda.ts`;

export const buildOptimizer = ({
  isLocal,
  nodeVersion,
  buildCallback,
}: {
  isLocal: boolean;
  nodeVersion: number;
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
      } else {
        build.initialOptions.external!.push(nodeVersion < 18 ? awsSdkV2 : awsSdkV3);
      }
    },
  };
};
