import { ILambdaMock, LambdaEndpoint } from "../runtime/lambdaMock";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "ANY";

export class Handlers {
  static handlers: ILambdaMock[] = [];
  static PORT = 0;
  static ip: string = "127.0.0.1";
  debug = false;
  constructor(config: any) {
    this.debug = config.debug;
  }

  static parseNameFromUrl(lambdaName: string) {
    const components = lambdaName.split("/");

    let name = components[1] == "@invoke" ? components[2] : components[3];
    name = decodeURIComponent(name);
    if (name.includes(":function")) {
      const arnComponent = name.split(":");
      name = arnComponent[arnComponent.length - 1];
    }

    return name;
  }
  static getHandlerByName(lambdaName?: string | null) {
    if (!lambdaName) {
      return;
    }
    const name = Handlers.parseNameFromUrl(lambdaName);
    return Handlers.handlers.find((x) => x.name == name || x.outName == name);
  }
  getHandler(method: HttpMethod, path: string, kind?: string | null) {
    const hasNotWilcard = !path.includes("*");
    const hasNotBrackets = !path.includes("{") && !path.includes("}");

    let foundLambda: { event: LambdaEndpoint; handler: ILambdaMock } | undefined;

    const foundHandler = Handlers.handlers.find((x) => {
      return x.endpoints
        .filter((e) => (kind ? e.kind == kind.toLowerCase() : e))
        .find((w) => {
          if (w.kind == "apg") {
            const isValidApgEvent = hasNotBrackets && w.paths.includes(path) && (w.methods.includes("ANY") || w.methods.includes(method));
            if (isValidApgEvent) {
              foundLambda = {
                event: w,
                handler: x,
              };
            }
            return isValidApgEvent;
          }
          const isValidAlbEvent = hasNotWilcard && w.paths.includes(path) && (w.methods.includes("ANY") || w.methods.includes(method));
          if (isValidAlbEvent) {
            foundLambda = {
              event: w,
              handler: x,
            };
          }
          return isValidAlbEvent;
        });
    });

    if (foundHandler) {
      return foundLambda;
    } else {
      // Use Regex to find lambda controller
      const foundHandler = Handlers.handlers.find((x) =>
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

            const isValidEvent = hasPath && (w.methods.includes("ANY") || w.methods.includes(method));
            if (isValidEvent) {
              foundLambda = {
                event: w,
                handler: x,
              };
            }
            return isValidEvent;
          })
      );

      if (foundHandler) {
        return foundLambda;
      }
    }
  }

  addHandler(lambdaController: ILambdaMock) {
    const foundIndex = Handlers.handlers.findIndex((x) => x.name == lambdaController.name && x.esOutputPath == lambdaController.esOutputPath);

    if (foundIndex == -1) {
      Handlers.handlers.push(lambdaController);
      if (this.debug) {
        if (lambdaController.endpoints.length) {
          lambdaController.endpoints.forEach((x) => {
            x.paths.forEach((p) => {
              this.#printPath(x.methods.join(" "), p);
            });
          });
        } else {
          this.#printPath("ANY", `/@invoke/${lambdaController.name}`);
        }
      }
    } else {
      Handlers.handlers[foundIndex] = lambdaController;
    }
  }

  #printPath(method: string, path: string) {
    const printingString = `${method}\thttp://localhost:${Handlers.PORT}${path}`;
    console.log(`\x1b[36m${printingString}\x1b[0m`);
  }
}
