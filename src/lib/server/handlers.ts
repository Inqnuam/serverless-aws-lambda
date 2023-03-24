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
  getHandler({ method, path, kind, headers, query }: { method: HttpMethod; path: string; headers: { [key: string]: string[] }; kind?: string | null; query: URLSearchParams }) {
    const hasNotWilcard = !path.includes("*");
    const hasNotBrackets = !path.includes("{") && !path.includes("}");

    let foundLambda: { event: LambdaEndpoint; handler: ILambdaMock } | undefined;
    const kindToLowerCase = kind?.toLowerCase();

    const foundHandler = Handlers.handlers.find((x) => {
      return x.endpoints
        .filter((e) => (kind ? e.kind == kindToLowerCase : e))
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
            const matches: boolean[] = [isValidAlbEvent];

            if (w.query) {
              const hasRequiredQueryString = Object.keys(w.query).some((k) => {
                const value = query.get(k);

                return typeof value == "string" && value == w.query![k];
              });

              matches.push(hasRequiredQueryString);
            }

            if (w.header) {
              const foundHeader = headers[w.header.name.toLowerCase()];

              if (foundHeader) {
                const hasRequiredHeader = w.header.values.some((v) => foundHeader.find((val) => val == v));

                matches.push(hasRequiredHeader);
              } else {
                matches.push(false);
              }
            }

            const matchesAll = matches.every((x) => x === true);

            if (matchesAll) {
              foundLambda = {
                event: w,
                handler: x,
              };
            }

            return matchesAll;
          }
        });
    });

    if (foundHandler) {
      return foundLambda;
    } else {
      // Use Regex to find lambda controller
      const foundHandler = Handlers.handlers.find((x) =>
        x.endpoints
          .filter((e) => (kind ? e.kind == kindToLowerCase : e))
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
              const matches: boolean[] = [isValidEvent];

              if (w.kind == "alb") {
                if (w.query) {
                  const hasRequiredQueryString = Object.keys(w.query).some((k) => {
                    const value = query.get(k);

                    return typeof value == "string" && value == w.query![k];
                  });

                  matches.push(hasRequiredQueryString);
                }

                if (w.header) {
                  const foundHeader = headers[w.header.name.toLowerCase()];

                  if (foundHeader) {
                    const hasRequiredHeader = w.header.values.some((v) => foundHeader.find((val) => val == v));

                    matches.push(hasRequiredHeader);
                  } else {
                    matches.push(false);
                  }
                }
              }

              const matchesAll = matches.every((x) => x === true);
              if (matchesAll) {
                foundLambda = {
                  event: w,
                  handler: x,
                };
              }

              return matchesAll;
            }
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
