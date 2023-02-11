import type { Plugin, OnResolveArgs, BuildResult } from "esbuild";
import { knownCjs } from "./knownCjs";

const awsSdkV3 = { filter: /^@aws-sdk\//, namespace: "file" };
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
  buildCallback: (result: BuildResult, isRebuild: boolean) => void | Promise<void>;
}): Plugin => {
  return {
    name: "build-optimizer-plugin",
    setup(build) {
      let isRebuild = false;

      build.onEnd(async (result) => {
        try {
          await buildCallback(result, isRebuild);
        } catch (error) {
          console.log(error);
        }
        isRebuild = true;
      });

      if (isLocal) {
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
