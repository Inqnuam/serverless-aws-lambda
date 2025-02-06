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
const external = ["esbuild", "archiver", "serve-static", "@smithy/eventstream-codec", "local-aws-sqs", "@aws-sdk/client-sqs", "ajv", "ajv-formats", "fast-xml-parser"];

/**
 * @type {import("esbuild").Plugin}
 */
const watchPlugin = {
  name: "watch-plugin",
  setup: (build) => {
    build.onResolve({ filter: /^\.\/standalone$/ }, (args) => {
      if (args.with.external == "true") {
        return {
          external: true,
          path: `${args.path}.mjs`,
        };
      }
    });

    const format = build.initialOptions.format;
    build.onEnd(async (result) => {
      console.log("Build", format, new Date().toLocaleString());

      compileDeclarations();

      if (build.initialOptions.format == "esm") {
        execSync("chmod +x dist/cli.mjs");
      }
    });
  },
};

const esBuildConfig = {
  bundle: true,
  minify: !shouldWatch,
  platform: "node",
  target: "node18",
  outdir: "dist",
  plugins: [watchPlugin],
  dropLabels: shouldWatch ? [] : ["DEV"],
  drop: shouldWatch ? [] : ["debugger"],
  external,
};

const bundle = shouldWatch ? esbuild.context : esbuild.build;
const buildIndex = bundle.bind(null, {
  ...esBuildConfig,
  entryPoints: [
    "./src/defineConfig.ts",
    "./src/lib/runtime/runners/node/index.ts",
    "./src/lambda/router.ts",
    "./src/plugins/sns/index.ts",
    "./src/plugins/sqs/index.ts",
    "./src/plugins/s3/index.ts",
    "./src/lambda/body-parser.ts",
  ],
  format: "cjs",
});

const buildRouterESM = bundle.bind(null, {
  ...esBuildConfig,
  entryPoints: [
    "./src/index.ts",
    "./src/standalone.ts",
    "./src/cli.ts",
    "./src/defineConfig.ts",
    "./src/lambda/router.ts",
    "./src/plugins/sns/index.ts",
    "./src/plugins/sqs/index.ts",
    "./src/plugins/s3/index.ts",
    "./src/lambda/body-parser.ts",
  ],
  format: "esm",
  outExtension: { ".js": ".mjs" },
});

const result = await Promise.all([buildIndex(), buildRouterESM()]);

if (shouldWatch) {
  await Promise.all(result.map((x) => x.watch()));
}
