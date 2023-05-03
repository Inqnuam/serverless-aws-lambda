import path from "path";
import { log } from "./colorize";

const jsExts = [".js", ".cjs", ".mjs"];
const tsExts = [".ts", ".mts"];

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
  if (jsExts.includes(parsed.ext)) {
    exportedFunc = await import(`file://${configPath}${parsed.ext}`);
  } else if (tsExts.includes(parsed.ext)) {
    throw new Error("TypeScript 'defineConfig' is not supported");
  } else {
    for (const ext of jsExts) {
      try {
        exportedFunc = await import(`file://${configPath}${ext}`);
        break;
      } catch (error) {
        err = error;
      }
    }
  }

  if (!exportedFunc) {
    log.YELLOW("Can not read defineConfig");
    log.info(err);
  }
  return { exportedFunc, configObjectName, configPath };
};
