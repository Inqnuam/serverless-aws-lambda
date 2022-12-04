import archiver from "archiver";
import { createReadStream, createWriteStream } from "fs";
import { access } from "fs/promises";
import { basename, dirname } from "path";

export const zip = (filePath: string, zipName: string) => {
  return new Promise((resolve) => {
    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    const zipOutputPath = `${dirname(filePath)}/${zipName}.zip`;
    const output = createWriteStream(zipOutputPath);

    archive.on("finish", () => {
      resolve(zipOutputPath);
    });
    archive.pipe(output);

    const fileName = basename(filePath) + ".js";
    archive.append(createReadStream(`${filePath}.js`), { name: fileName });

    // NOTE: do we really need sourcemaps in AWS ?
    // const sourceMapPath = filePath + ".js.map";
    // try {
    //   await access(sourceMapPath);
    //   archive.append(createReadStream(`${filePath}.js.map`), { name: fileName + ".map" });
    // } catch (error) {}

    archive.finalize();
  });
};
