const esbuild = require("esbuild");
const { nodeExternalsPlugin } = require("esbuild-node-externals");

const esBuildConfig = {
  bundle: true,
  minify: !process.env.DEV,
  platform: "node",
  target: "es2018",
  plugins: [nodeExternalsPlugin()],
  outdir: "dist",
  watch: process.env.DEV
    ? {
        onRebuild: () => {
          console.log("Compiler rebuild");
        },
      }
    : false,
};

const run = async () => {
  const buildIndex = esbuild.build.bind(null, { ...esBuildConfig, external: ["./src/lib/worker.js"], entryPoints: ["./src/index.ts"] });
  const buildWorker = esbuild.build.bind(null, { ...esBuildConfig, entryPoints: ["./src/lib/worker.js"] });

  const buildRoute = esbuild.build.bind(null, { ...esBuildConfig, entryPoints: ["./src/lambda/route.ts"], outdir: undefined, outfile: "./route.js" });
  const result = await Promise.all([buildIndex(), buildRoute(), buildWorker()]);
  console.log(result);
};

run();
