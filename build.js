const esbuild = require("esbuild");
const { nodeExternalsPlugin } = require("esbuild-node-externals");

const esBuildConfig = {
  bundle: true,
  minify: true,
  platform: "node",
  plugins: [nodeExternalsPlugin()],
  outdir: "dist",
};

const run = async () => {
  const buildIndex = esbuild.build({ ...esBuildConfig, external: ["./src/lib/worker.js"], entryPoints: ["./src/index.js"] });

  const buildWorker = esbuild.build({ ...esBuildConfig, entryPoints: ["./src/lib/worker.js"] });

  const result = await Promise.all([buildIndex, buildWorker]);
  console.log(result);
};

run();
