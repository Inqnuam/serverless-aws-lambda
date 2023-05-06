import path from "path";
import { log } from "./colorize";
import esbuild from "esbuild";
import { createRequire } from "node:module";
import vm from "vm";
import { fileURLToPath, pathToFileURL } from "url";
import { access } from "fs/promises";

const jsExts = [".js", ".cjs", ".mjs"];
const tsExts = [".ts", ".mts"];

const readTsDefineConfig = async (sourcefile: string) => {
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
  const configPath = path.posix.resolve(customFilePath);

  let exportedFunc;
  let err;
  const sourceFile = `${configPath}${parsed.ext}`;

  try {
    if (jsExts.includes(parsed.ext)) {
      exportedFunc = await import(`file://${sourceFile}`);
    } else if (tsExts.includes(parsed.ext)) {
      exportedFunc = await readTsDefineConfig(sourceFile);
    } else {
      for (const ext of jsExts) {
        try {
          exportedFunc = await import(`file://${configPath}${ext}`);
          break;
        } catch (error) {
          err = error;
        }
      }

      if (err) {
        for (const ext of tsExts) {
          try {
            const predictedPath = `${configPath}${ext}`;
            await access(predictedPath);
            exportedFunc = await readTsDefineConfig(predictedPath);
            break;
          } catch (error) {
            err = error;
          }
        }
      }
    }
  } catch (error) {}

  if (!exportedFunc) {
    log.YELLOW(`Can not read 'defineConfig' from ${config}`);
  }
  return { exportedFunc, configObjectName, configPath };
};
