import archiver from "archiver";
import { createReadStream, createWriteStream } from "fs";
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

    archive.finalize();
  });
};
