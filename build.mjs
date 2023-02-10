import esbuild from "esbuild";
import { execSync } from "child_process";
import { nodeExternalsPlugin } from "esbuild-node-externals";

const shouldWatch = process.env.DEV == "true";

const compileDeclarations = () => {
  try {
    execSync("tsc");
  } catch (error) {
    console.log(error.output?.[1]?.toString());
  }
};

const esBuildConfig = {
  bundle: true,
  minify: !process.env.DEV,
  platform: "node",
  target: "es2018",
  plugins: [nodeExternalsPlugin()],
  outdir: "dist",
  format: "cjs",
  outExtension: { ".js": ".cjs" },
};

const watch = {
  watch: shouldWatch && {
    onRebuild: () => {
      console.log("Compiler rebuild", new Date().toLocaleString());
      compileDeclarations();
    },
  },
};

const buildIndex = esbuild.build.bind(null, {
  ...esBuildConfig,
  external: ["./src/lib/worker.js"],
  entryPoints: [
    "./src/index.ts",
    "./src/server.ts",
    "./src/defineConfig.ts",
    "./src/lib/worker.js",
    "./src/lambda/router.ts",
    "./src/plugins/sns/index.ts",
    "./src/plugins/s3/index.ts",
    "./src/plugins/body-parser.ts",
  ],
  ...watch,
});

const buildRouterESM = esbuild.build.bind(null, {
  ...esBuildConfig,
  entryPoints: ["./src/lambda/router.ts", "./src/server.ts", "./src/plugins/body-parser.ts"],
  watch: shouldWatch,
  format: "esm",
  outExtension: { ".js": ".mjs" },
});

const result = await Promise.all([buildIndex(), buildRouterESM()]);

compileDeclarations();
console.log(result);
