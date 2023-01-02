import { Plugin } from "esbuild";

export const awsSdkv3ExternalPlugin: Plugin = {
  name: "awsSdkv3ExternalPlugin",
  setup: (build) => {
    build.onResolve({ filter: /^@aws-sdk\//, namespace: "file" }, (args) => {
      return {
        path: args.path,
        external: true,
      };
    });
  },
};
