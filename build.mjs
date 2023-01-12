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
};

const watch = {
  watch: shouldWatch && {
    onRebuild: () => {
      console.log("Compiler rebuild", new Date().toLocaleString());
      compileDeclarations();
    },
  },
};

const buildIndex = esbuild.build.bind(null, { ...esBuildConfig, external: ["./src/lib/worker.js"], entryPoints: ["./src/index.ts"], ...watch });
const buildWorker = esbuild.build.bind(null, { ...esBuildConfig, entryPoints: ["./src/lib/worker.js"], watch: shouldWatch });

const buildRouter = esbuild.build.bind(null, {
  ...esBuildConfig,
  entryPoints: ["./src/lambda/router.ts"],
  watch: shouldWatch,
  outdir: "dist/lambda",
  format: "cjs",
  outExtension: { ".js": ".cjs" },
});
const buildRouterESM = esbuild.build.bind(null, {
  ...esBuildConfig,
  entryPoints: ["./src/lambda/router.ts"],
  watch: shouldWatch,
  outdir: "dist/lambda",
  format: "esm",
  outExtension: { ".js": ".mjs" },
});

const buildServerRunnerESM = esbuild.build.bind(null, { ...esBuildConfig, entryPoints: ["./src/server.ts"], watch: shouldWatch, format: "esm", outExtension: { ".js": ".mjs" } });
const buildServerRunner = esbuild.build.bind(null, { ...esBuildConfig, entryPoints: ["./src/server.ts"], watch: shouldWatch, format: "cjs", outExtension: { ".js": ".cjs" } });
const result = await Promise.all([buildIndex(), buildWorker(), buildRouter(), buildRouterESM(), buildServerRunnerESM(), buildServerRunner()]);

compileDeclarations();
console.log(result);
