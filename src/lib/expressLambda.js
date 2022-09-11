const { LambdaCompiler } = require("../compiler/src/compiler");
const path = require("path");

const ExpressLambda = ({ dev }) => {
  return {
    name: "Express Lambda",
    setup(build) {
      const entryPoints = build.initialOptions.entryPoints
        .map((e) => {
          const asTsFile = e.replace(path.basename(e), `${path.basename(e)}.ts`);
          return asTsFile.replace(/\//g, "\\/");
        })
        .join("|");

      const regg = new RegExp(entryPoints);

      build.onLoad({ filter: regg }, async (args) => {
        const output = new LambdaCompiler(args.path, dev).output;

        return {
          contents: output,
          loader: "ts",
        };
      });
    },
  };
};

exports.ExpressLambda = ExpressLambda;
