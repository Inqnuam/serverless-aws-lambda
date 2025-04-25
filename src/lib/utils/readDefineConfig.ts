import path from "path";
import { log } from "./colorize";
import esbuild from "esbuild";
import { rm } from "fs/promises";
import { pathToFileURL } from "url";

const jsExt = ["js", "mjs", "cjs", "ts", "cts", "mts"];

const readFromPath = async (sourcefile: string) => {
  const dir = path.dirname(path.toNamespacedPath(sourcefile));
  const fname = path.basename(sourcefile, path.extname(sourcefile));
  const outfile = path.join(dir, `__${fname}.mjs`);

  await esbuild.build({
    outfile,
    entryPoints: [sourcefile],
    bundle: true,
    packages: "external",
    platform: "node",
    format: "esm",
    target: `node${process.versions.node.split(".")[0]}`,
    minify: true,
    sourcemap: "inline",
    sourcesContent: true,
  });

  try {
    const config = await import(pathToFileURL(outfile).href);
    return config;
  } catch (error) {
    throw error;
  } finally {
    await rm(outfile);
  }
};

export const readDefineConfig = async (config: string) => {
  if (!config || typeof config !== "string") {
    return;
  }

  const parsed = path.posix.parse(config);

  const customFilePath = path.posix.join(parsed.dir, parsed.name);
  const configObjectName = parsed.ext.slice(1);
  let configPath = path.posix.resolve(customFilePath);

  if (jsExt.includes(configObjectName)) {
    configPath += `.${configObjectName}`;
  }

  let exportedFunc;

  try {
    exportedFunc = await readFromPath(configPath);
  } catch (error) {
    log.YELLOW(`Can not read 'defineConfig' from ${config}`);
    console.error(error);
    process.exit(1);
  }

  return { exportedFunc, configObjectName, configPath };
};
