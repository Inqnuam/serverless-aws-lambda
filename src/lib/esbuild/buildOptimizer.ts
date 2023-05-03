import type { Plugin, OnResolveArgs, BuildResult } from "esbuild";
import { knownCjs } from "./knownCjs";

const awsSdkV3 = { filter: /^@aws-sdk\//, namespace: "file" };
const awslambda = `${__dirname.slice(0, -5)}/src/lib/runtime/awslambda.ts`;

const isExternal = (args: OnResolveArgs) => {
  return {
    path: args.path,
    external: true,
  };
};

export const buildOptimizer = ({
  isLocal,
  nodeVersion,
  buildCallback,
}: {
  isLocal: boolean;
  nodeVersion: number;
  buildCallback: (result: BuildResult, isRebuild: boolean, format: string) => void | Promise<void>;
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
          await buildCallback(result, isRebuild, build.initialOptions.format!);
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

        build.onResolve(awsSdkV3, isExternal);
      } else {
        if (nodeVersion < 18) {
          build.initialOptions.external!.push("aws-sdk");
        } else {
          build.onResolve(awsSdkV3, isExternal);
        }
      }
    },
  };
};
