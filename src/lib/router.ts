import { ILambdaMock } from "./lambdaMock";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "ANY";

export class AlbRouter {
  #handlers: ILambdaMock[] = [];
  static PORT = 0;
  debug = false;
  constructor(config: any) {
    this.debug = config.debug;
  }

  getHandler(method: HttpMethod, path: string, kind?: string) {
    const foundHandler = this.#handlers.find((x) =>
      x.endpoints
        .filter((e) => (kind ? e.kind == kind : e))
        .find((w) => {
          return w.paths.includes(path) && (w.methods.includes("ANY") || w.methods.includes(method));
        })
    );

    if (foundHandler) {
      return foundHandler;
    } else {
      // Use Regex to find lambda controller
      return this.#handlers.find((x) =>
        x.endpoints
          .filter((e) => (kind ? e.kind == kind : e))
          .find((w) => {
            const hasPath = w.paths.find((p) => {
              const rawPattern = p.replace(/\*/g, ".*").replace(/\//g, "\\/");
              const pattern = new RegExp(`^${rawPattern}$`, "g");

              return pattern.test(path);
            });
            return hasPath && (w.methods.includes("ANY") || w.methods.includes(method));
          })
      );
    }
  }

  addHandler(lambdaController: ILambdaMock) {
    const foundIndex = this.#handlers.findIndex((x) => x.esOutputPath == lambdaController.esOutputPath);

    if (foundIndex == -1) {
      this.#handlers.push(lambdaController);
      if (this.debug) {
        lambdaController.endpoints.forEach((x) => {
          x.paths.forEach((p) => {
            this.#printPath(x.methods.join(" "), p);
          });
        });
      }
    } else {
      this.#handlers[foundIndex] = lambdaController;
    }
  }

  #printPath(method: string, path: string) {
    const printingString = `${method}\thttp://localhost:${AlbRouter.PORT}${path}`;
    console.log(`\x1b[36m${printingString}\x1b[0m`);
  }
}
