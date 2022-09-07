const { LambdaCompiler } = require("../compiler/src/compiler");

const ExpressLambda = ({ dev }) => {
  return {
    name: "Express Lambda",
    setup(build) {
      const entryPoints = build.initialOptions.entryPoints
        // .filter((e) => e.endsWith(".ts"))
        .map((e) => {
          const himar = e.replace(path.basename(e), `${path.basename(e)}.ts`);
          return himar.replace(/\//g, "\\/");
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
