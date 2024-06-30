import esbuild from "esbuild";
import { execSync } from "child_process";

const shouldWatch = process.env.DEV == "true";

const compileDeclarations = () => {
  try {
    execSync("tsc");
  } catch (error) {
    console.log(error.output?.[1]?.toString());
  }
};
const external = ["esbuild", "archiver", "serve-static", "@smithy/eventstream-codec", "local-aws-sqs", "@aws-sdk/client-sqs", "ajv", "ajv-formats"];
const watchPlugin = {
  name: "watch-plugin",
  setup: (build) => {
    const format = build.initialOptions.format;
    build.onEnd(async (result) => {
      console.log("Build", format, new Date().toLocaleString());
      compileDeclarations();
    });
  },
};

const esBuildConfig = {
  bundle: true,
  minify: !shouldWatch,
  platform: "node",
  target: "ES6",
  outdir: "dist",
  format: "cjs",
  plugins: [watchPlugin],
  dropLabels: shouldWatch ? [] : ["DEV"],
  drop: shouldWatch ? [] : ["debugger"],
  external,
};

const bundle = shouldWatch ? esbuild.context : esbuild.build;
const buildIndex = bundle.bind(null, {
  ...esBuildConfig,
  entryPoints: [
    "./src/index.ts",
    "./src/server.ts",
    "./src/defineConfig.ts",
    "./src/lib/runtime/runners/node/index.ts",
    "./src/lambda/router.ts",
    "./src/plugins/sns/index.ts",
    "./src/plugins/sqs/index.ts",
    "./src/plugins/s3/index.ts",
    "./src/lambda/body-parser.ts",
  ],
});

const buildRouterESM = bundle.bind(null, {
  ...esBuildConfig,
  entryPoints: [
    "./src/lambda/router.ts",
    "./src/server.ts",
    "./src/lambda/body-parser.ts",
    "./src/defineConfig.ts",
    "./src/plugins/sns/index.ts",
    "./src/plugins/sqs/index.ts",
    "./src/plugins/s3/index.ts",
  ],
  format: "esm",
  outExtension: { ".js": ".mjs" },
});

const result = await Promise.all([buildIndex(), buildRouterESM()]);

if (shouldWatch) {
  await Promise.all(result.map((x) => x.watch()));
}
