import archiver from "archiver";
import { createReadStream, createWriteStream } from "fs";
import { basename } from "path";

export const zip = (filePath: string) => {
  return new Promise((resolve) => {
    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    archive.on("finish", resolve);

    const output = createWriteStream(`${filePath}.zip`);

    archive.pipe(output);

    const fileName = basename(filePath) + ".js";
    archive.append(createReadStream(`${filePath}.js`), { name: fileName });

    archive.finalize();
  });
};
