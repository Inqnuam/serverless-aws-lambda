import archiver from "archiver";
import { createReadStream, createWriteStream } from "fs";
import { access, stat } from "fs/promises";
import path from "path";
import type Serverless from "serverless";
import type { ILambdaMock } from "../runtime/rapidApi";
import type { Metafile } from "esbuild";

const cwd = process.cwd();

interface includeWithAlias {
  at: string;
  as: string;
}
interface includeWithPattern {
  pattern?: string;
  dir?: string;
}
interface includeFromText {
  text: string;
  to: string;
}
type includeFiles = string | includeWithAlias | includeWithPattern | includeFromText;

export interface IZipOptions {
  filePath: string;
  handlerPath: string;
  zipName: string;
  include: includeFiles[];
  sourcemap?: boolean | string;
  preserveDir?: boolean | undefined;
  format: string;
}

export class Zipper {
  serverless: Serverless;
  defaultPreserveDir: boolean = true;
  defaultFiles: IZipOptions["include"] = [];
  defaultAssets: boolean | string | string[] = false;
  format: string;
  sourcemap: IZipOptions["sourcemap"];
  outputs: Metafile["outputs"];
  outdir: string;
  constructor(serverless: Serverless, format: string, sourcemap: IZipOptions["sourcemap"], outputs: Metafile["outputs"], outdir: string) {
    this.serverless = serverless;
    this.format = format;
    this.sourcemap = sourcemap;
    this.outputs = outputs;
    this.outdir = path.resolve(outdir);

    if (this.serverless.service.package) {
      if (typeof this.serverless.service.package.preserveDir == "boolean") {
        this.defaultPreserveDir = this.serverless.service.package.preserveDir;
      }
      if (Array.isArray(this.serverless.service.package.files)) {
        this.defaultFiles = this.serverless.service.package.files;
      }

      const assets = this.serverless.service.package.assets;

      if (this.isValidAssetsType(assets)) {
        this.defaultAssets = assets;
      }
    }
  }
  normalizePath = (p: string) => {
    return path.win32.normalize(p).replace(/\\/g, "/");
  };
  isValidAssetsType(assets: any) {
    return ["string", "boolean"].includes(typeof assets) || (Array.isArray(assets) && assets.every((x) => typeof x == "string"));
  }
  package = ({ filePath, handlerPath, zipName, include, sourcemap, format, preserveDir }: IZipOptions) => {
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

      let fileName = path.basename(filePath) + ".js";
      if (preserveDir) {
        fileName = path.join(path.dirname(handlerPath), fileName);
      }
      archive.append(createReadStream(`${filePath}.js`), { name: fileName });

      if (sourcemap && sourcemap != "inline") {
        const sourcemapName = `${fileName}.map`;
        const sourcemapPath = `${filePath}.js.map`;

        try {
          await access(sourcemapPath);
          archive.append(createReadStream(sourcemapPath), { name: sourcemapName });
        } catch (error) {}
      }

      if (format == "esm") {
        archive.append('{"type":"module"}', { name: "package.json" });
      }

      for (const file of include as any[]) {
        const isString = typeof file == "string";
        const isPattern = !isString && typeof file.pattern == "string";
        const isText = !isString && !isPattern && file.text;
        const dir = isPattern ? file.dir : cwd;
        const alias = isString ? file : isText ? file.to : file.as;

        try {
          if (isPattern) {
            archive.glob(file.pattern as string, { cwd: dir });
          } else if (isText) {
            archive.append(Buffer.from(file.text), { name: alias });
          } else if (isString || alias) {
            const includPath = path.resolve(isString ? file : file.at);
            const f = await stat(includPath);
            if (f.isFile()) {
              archive.append(createReadStream(includPath), { name: alias });
            } else if (f.isDirectory() || f.isSymbolicLink()) {
              archive.directory(includPath, alias);
            }
          }
        } catch (error) {
          console.error(error);
        }
      }

      archive.finalize();
    });
  };
  getAssets = (outputPath: string, handlerRoot: string): includeWithAlias[] => {
    const output = this.outputs[outputPath];
    const outputMap = this.outputs[`${outputPath}.map`];
    if (!output) {
      return [];
    }
    const files: includeWithAlias[] = [];
    const { cssBundle, imports, entryPoint } = output;

    if (cssBundle && entryPoint) {
      const fileName = path.basename(cssBundle);
      const outDir = path.dirname(entryPoint);
      const alias = path.join(outDir, fileName);

      files.push({
        at: cssBundle,
        as: alias,
      });

      if (outputMap) {
        files.push({
          at: `${cssBundle}.map`,
          as: `${alias}.map`,
        });
      }

      files.push(...this.getAssets(cssBundle, handlerRoot));
    }

    imports.forEach((x) => {
      if (x.external) {
        return;
      }
      files.push({
        at: x.path,
        as: path.join(handlerRoot, ...this.normalizePath(x.path).split("/").slice(1)),
      });
    });
    return files;
  };
  zipHandler = async (l: ILambdaMock) => {
    const slsDeclaration = this.serverless.service.getFunction(l.name) as any;

    if (typeof slsDeclaration.package?.artifact == "string") {
      return;
    }
    const outputPath = l.esOutputPath.replace(`${cwd}${path.sep}`, "");
    const normalizedPath = this.normalizePath(outputPath);
    let inheritFiles = true;
    if (slsDeclaration.package && "inheritFiles" in slsDeclaration.package) {
      inheritFiles = slsDeclaration.package.inheritFiles;
    }
    let filesToInclude: IZipOptions["include"] = slsDeclaration.package?.files ?? [];
    if (inheritFiles) {
      filesToInclude = filesToInclude.concat(this.defaultFiles);
    }
    const zipableBundledFilePath = l.esOutputPath.slice(0, -3);
    const preserveDir = slsDeclaration.package && "preserveDir" in slsDeclaration.package ? slsDeclaration.package.preserveDir : this.defaultPreserveDir;
    const handlerRoot = path.win32.normalize(l.handlerPath).split("\\").filter(Boolean)[0];
    const includeAssets = this.isValidAssetsType(slsDeclaration.package?.assets) ? slsDeclaration.package.assets : this.defaultAssets;

    if (includeAssets) {
      const assets = this.getAssets(normalizedPath, handlerRoot);
      const tIncludeAssets = typeof includeAssets;

      if (tIncludeAssets == "boolean") {
        filesToInclude = filesToInclude.concat(assets);
      } else {
        const exts = tIncludeAssets == "object" ? includeAssets : [includeAssets];
        const filteredAssets = assets.filter((x) => exts.includes(path.extname(x.at)));
        filesToInclude = filesToInclude.concat(filteredAssets);
      }
    }

    const zipOptions: IZipOptions = {
      filePath: zipableBundledFilePath,
      handlerPath: l.handlerPath,
      zipName: l.outName,
      include: filesToInclude,
      sourcemap: this.sourcemap,
      format: this.format,
      preserveDir,
    };
    const zipOutputPath = await this.package(zipOptions);
    slsDeclaration.package = { ...slsDeclaration.package, artifact: zipOutputPath };
    if (!preserveDir) {
      slsDeclaration.handler = path.basename(l.handlerPath);
    }
  };
}
