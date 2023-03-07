import archiver from "archiver";
import { createReadStream, createWriteStream } from "fs";
import { access } from "fs/promises";
import path from "path";

export const zip = (filePath: string, zipName: string, include?: string[]) => {
  return new Promise(async (resolve) => {
    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    const zipOutputPath = `${path.dirname(filePath)}/${zipName}.zip`;
    const output = createWriteStream(zipOutputPath);

    archive.on("finish", () => {
      resolve(zipOutputPath);
    });
    archive.pipe(output);

    const fileName = path.basename(filePath) + ".js";
    archive.append(createReadStream(`${filePath}.js`), { name: fileName });

    if (include && include.every((x) => typeof x == "string")) {
      for (const file of include) {
        const includPath = path.resolve(file);
        try {
          await access(includPath);
          archive.append(createReadStream(includPath), { name: file });
        } catch (error) {
          console.error(error);
        }
      }
    }

    archive.finalize();
  });
};
