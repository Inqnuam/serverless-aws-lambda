const fs = require("fs");
const archiver = require("archiver");

const path = require("path");

const zip = (filePath) => {
  return new Promise((resolve) => {
    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    archive.on("finish", resolve);

    const output = fs.createWriteStream(`${filePath}.zip`);

    archive.pipe(output);

    const fileName = path.basename(filePath) + ".js";
    archive.append(fs.createReadStream(`${filePath}.js`), { name: fileName });

    archive.finalize();
  });
};

module.exports.zip = zip;
