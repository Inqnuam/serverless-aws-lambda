const { execSync } = require("child_process");
const esbuild = require("esbuild");
const { nodeExternalsPlugin } = require("esbuild-node-externals");

const compileDeclarations = () => {
  try {
    execSync("tsc && rm -rf ./express && mv -f dist/lambda/* ./ && rm -rf dist/lambda && mv dist/route.js ./");
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
  entryNames: "[name]",
  watch: process.env.DEV && {
    onRebuild: () => {
      console.log("Compiler rebuild", new Date().toLocaleString());
      compileDeclarations();
    },
  },
};

const entryPoints = ["./src/index.ts", "./src/lambda/route.ts"];

(async () => {
  const buildIndex = esbuild.build.bind(null, { ...esBuildConfig, external: ["./src/lib/worker.js"], entryPoints });
  const buildWorker = esbuild.build.bind(null, { ...esBuildConfig, entryPoints: ["./src/lib/worker.js"] });

  const result = await Promise.all([buildIndex(), buildWorker()]);

  compileDeclarations();
  console.log(result);
})();
