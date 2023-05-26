import { statSync } from "fs";
import path from "path";

// will be called synchronously at process.exit
export const getLocalStoragePath = (storagePath?: string) => {
  let localStoragePath = typeof storagePath == "string" ? storagePath : "localS3/";

  localStoragePath = path.resolve(localStoragePath);

  if (!localStoragePath.endsWith("/")) {
    localStoragePath += "/";
  }

  try {
    const f = statSync(localStoragePath);

    // TODO: check also for isSymbolicLink
    if (f.isDirectory()) {
      return localStoragePath;
    } else {
      throw new Error(`Provided localStorageDir '${storagePath}' is not a directory`);
    }
  } catch (error: any) {
    if (error.code == "ENOENT") {
      return localStoragePath;
    } else if (error.code == "ENOTDIR") {
      throw new Error(`Provided localStorageDir '${storagePath}' is not a directory`);
    } else {
      throw error;
    }
  }
};
