const fs = require("fs/promises");
const handlebars = require("handlebars");

let foundHelpers;
class ESBuildHandlebarsJSCompiler extends handlebars.JavaScriptCompiler {
  nameLookup(parent, name, type) {
    if (type === "helper" && !foundHelpers.includes(name)) {
      foundHelpers.push(name);
    }
    return super.nameLookup(parent, name, type);
  }
}
function hbs(options = {}) {
  const { filter = /\.(hbs|handlebars)$/i, additionalHelpers = {}, precompileOptions = {} } = options;
  return {
    name: "handlebars",
    setup(build) {
      const fileCache = new Map();
      const hb = handlebars.create();
      hb.JavaScriptCompiler = ESBuildHandlebarsJSCompiler;
      build.onLoad({ filter }, async ({ path: filename }) => {
        if (fileCache.has(filename)) {
          const cachedFile = fileCache.get(filename) || {
            data: null,
            modified: new Date(0),
          };
          let cacheValid = true;
          try {
            // Check that mtime isn't more recent than when we cached the result
            if ((await fs.stat(filename)).mtime > cachedFile.modified) {
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
        const source = await fs.readFile(filename, "utf-8");
        //const foundHelpers: string[] = [];
        const knownHelpers = Object.keys(additionalHelpers).reduce((prev, helper) => {
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
        } catch (err) {
          const exception = err;
          const esBuildError = { text: exception.message };
          return { errors: [esBuildError] };
        }
      });
    },
  };
}
exports.handlebars = hbs;
