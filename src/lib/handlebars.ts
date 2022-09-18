//const handlebars = require("handlebars");

import handlebars from "handlebars";
import { PluginBuild, OnLoadOptions } from "esbuild";
import { stat, readFile } from "fs/promises";

let foundHelpers: string[] = [];
// @ts-ignore
class ESBuildHandlebarsJSCompiler extends handlebars.JavaScriptCompiler {
  // @ts-ignore
  nameLookup(parent, name: string, type) {
    if (type === "helper" && !foundHelpers.includes(name)) {
      foundHelpers.push(name);
    }
    return super.nameLookup(parent, name, type);
  }
}
function hbs(options: { additionalHelpers: any; precompileOptions: any } = { additionalHelpers: {}, precompileOptions: {} }) {
  const onloadOpt: OnLoadOptions = {
    filter: /\.(hbs|handlebars)$/i,
  };

  const { additionalHelpers = {}, precompileOptions = {} } = options;
  return {
    name: "handlebars",
    setup(build: PluginBuild) {
      const fileCache = new Map();
      const hb = handlebars.create();
      // @ts-ignore
      hb.JavaScriptCompiler = ESBuildHandlebarsJSCompiler;
      build.onLoad(onloadOpt, async ({ path: filename }) => {
        if (fileCache.has(filename)) {
          const cachedFile = fileCache.get(filename) || {
            data: null,
            modified: new Date(0),
          };
          let cacheValid = true;
          try {
            // Check that mtime isn't more recent than when we cached the result
            if ((await stat(filename)).mtime > cachedFile.modified) {
              cacheValid = false;
            }
          } catch {
            cacheValid = false;
          }
          if (cacheValid) {
            return cachedFile.data;
          } else {
            // Not valid, so can be deleted
            fileCache.delete(filename);
          }
        }
        const source = await readFile(filename, "utf-8");
        //const foundHelpers: string[] = [];
        const knownHelpers = Object.keys(additionalHelpers).reduce((prev: any, helper: string) => {
          prev[helper] = true;
          return prev;
        }, {});
        // Compile options
        const compileOptions = {
          ...precompileOptions,
          knownHelpersOnly: true,
          knownHelpers,
        };
        try {
          foundHelpers = [];
          const template = hb.precompile(source, compileOptions);
          const foundAndMatchedHelpers = foundHelpers.filter((helper) => additionalHelpers[helper] !== undefined);
          const contents = [
            "import * as Handlebars from 'handlebars/runtime';",
            ...foundAndMatchedHelpers.map((helper) => `import ${helper} from '${additionalHelpers[helper]}';`),
            `Handlebars.registerHelper({${foundAndMatchedHelpers.join()}});`,
            `export default Handlebars.template(${template});`,
          ].join("\n");
          return { contents };
        } catch (err: any) {
          const esBuildError = { text: err.message };
          return { errors: [esBuildError] };
        }
      });
    },
  };
}
export { hbs };
