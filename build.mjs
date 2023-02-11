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
const external = ["esbuild", "archiver", "serve-static"];
const watchPlugin = {
  name: "watch-plugin",
  setup: (build) => {
    build.onEnd(async (result) => {
      console.log("Compiler rebuild", new Date().toLocaleString());
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
};

const bundle = shouldWatch ? esbuild.context : esbuild.build;
const buildIndex = bundle.bind(null, {
  ...esBuildConfig,
  external: external.concat(["./src/lib/worker.js"]),
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
});

const buildRouterESM = bundle.bind(null, {
  ...esBuildConfig,
  entryPoints: ["./src/lambda/router.ts", "./src/server.ts", "./src/plugins/body-parser.ts"],
  format: "esm",
  outExtension: { ".js": ".mjs" },
  external,
});

const result = await Promise.all([buildIndex(), buildRouterESM()]);

if (shouldWatch) {
  await Promise.all(result.map((x) => x.watch()));
}
