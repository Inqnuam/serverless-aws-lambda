import path from "path";
import { log } from "./colorize";
import esbuild from "esbuild";
import { createRequire } from "node:module";
import vm from "vm";
import { fileURLToPath, pathToFileURL } from "url";

const jsExt = ["js", "mjs", "cjs", "ts", "cts", "mts"];

const readFromPath = async (sourcefile: string) => {
  const { href } = pathToFileURL(sourcefile);
  const filename = fileURLToPath(href);
  const exports = {};
  const context = {
    require: createRequire(href),
    exports,
    module: {
      exports,
    },
    __filename: filename,
    __dirname: path.dirname(filename),
  };
  const tt = await esbuild.build({
    write: false,
    entryPoints: [sourcefile],
    bundle: true,
    packages: "external",
    platform: "node",
    format: "cjs",
    target: "ES2018",
    // supported: {
    //   "top-level-await": true, // TODO: esbuild ask for cjs + top-level-await support
    // },
    banner: {
      js: `async (${Object.keys(context).join(",")})=>{`,
    },
    footer: {
      js: "\nreturn module}",
    },
  });
  const fn = vm.runInThisContext(tt.outputFiles[0].text, {
    filename: sourcefile,
  });

  const res = await fn(...Object.values(context));

  return res.exports;
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
