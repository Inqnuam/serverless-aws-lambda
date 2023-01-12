import { ILambdaMock } from "./lambdaMock";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "ANY";

export class AlbRouter {
  #handlers: ILambdaMock[] = [];
  static PORT = 0;
  debug = false;
  constructor(config: any) {
    this.debug = config.debug;
  }

  getHandlerByName(lambdaName?: string | null) {
    if (!lambdaName) {
      return;
    }
    const name = lambdaName.split("/")[3];
    return this.#handlers.find((x) => x.name == name || x.outName == name);
  }
  getHandler(method: HttpMethod, path: string, kind?: string | null) {
    const hasNotWilcard = !path.includes("*");
    const hasNotBrackets = !path.includes("{") && !path.includes("}");

    const foundHandler = this.#handlers.find((x) => {
      return x.endpoints
        .filter((e) => (kind ? e.kind == kind.toLowerCase() : e))
        .find((w) => {
          if (w.kind == "apg") {
            return hasNotBrackets && w.paths.includes(path) && (w.methods.includes("ANY") || w.methods.includes(method));
          }

          return hasNotWilcard && w.paths.includes(path) && (w.methods.includes("ANY") || w.methods.includes(method));
        });
    });

    if (foundHandler) {
      return foundHandler;
    } else {
      // Use Regex to find lambda controller
      const foundHandler = this.#handlers.find((x) =>
        x.endpoints
          .filter((e) => (kind ? e.kind == kind : e))
          .find((w) => {
            const hasPath = w.paths.find((p) => {
              const AlbAnyPathMatch = p.replace(/\*/g, ".*").replace(/\//g, "\\/");
              const ApgPathPartMatch = p.replace(/\{[\w.:-]+\+?\}/g, ".*").replace(/\//g, "\\/");

              const AlbPattern = new RegExp(`^${AlbAnyPathMatch}$`, "g");
              const ApgPattern = new RegExp(`^${ApgPathPartMatch}$`, "g");

              return (w.kind == "alb" && hasNotWilcard && AlbPattern.test(path)) || (w.kind == "apg" && hasNotBrackets && ApgPattern.test(path));
            });
            return hasPath && (w.methods.includes("ANY") || w.methods.includes(method));
          })
      );

      return foundHandler;
    }
  }

  addHandler(lambdaController: ILambdaMock) {
    const foundIndex = this.#handlers.findIndex((x) => x.name == lambdaController.name && x.esOutputPath == lambdaController.esOutputPath);

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
