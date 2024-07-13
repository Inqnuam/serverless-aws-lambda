import type { ILambdaMock, LambdaEndpoint } from "../runtime/rapidApi";
import { log } from "../utils/colorize";
import type { normalizedSearchParams } from "../../plugins/lambda/events/common";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "ANY";
const customInvokeUrls = ["@invoke", "@url"];

const invalidParams = (lambdaName: string) => log.YELLOW(`Invalid Request Headers or query string for ${lambdaName}`);
// const canMatchWithTrailingSlash = (reqPath: string, declaredPath: string) => {};

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

    let name = customInvokeUrls.includes(components[1]) ? components[2] : components[3];
    name = decodeURIComponent(name);
    if (name.includes(":function:")) {
      const arnComponent = name.split(":function:");
      name = arnComponent[arnComponent.length - 1];
    }

    if (name.includes(":")) {
      const versionnedFunctionNameComponents = name.split(":");

      if (versionnedFunctionNameComponents.length == 2) {
        name = versionnedFunctionNameComponents[0];
      }
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

  static #matchAlbQuery = (query: LambdaEndpoint["query"], reqQuery: normalizedSearchParams) => {
    const matchesAll: boolean[] = [];

    const queryAsString = reqQuery.toString();
    query!.forEach((q) => {
      const matches: boolean = q.some(({ Key, Value }) => {
        if (Key) {
          const keysValues = reqQuery[Key.toLowerCase()];
          if (!Value) {
            log.RED("alb conditions query must have 'Value' when 'Key' is specified");
            return false;
          }
          if (keysValues) {
            return keysValues.includes(Value.toLowerCase());
          } else {
            return false;
          }
        } else if (Value) {
          // in AWS when no Key is provided, Value = URLSearchParams's Key
          return queryAsString == Value.toLowerCase();
        }
      });

      matchesAll.push(matches);
    });

    return matchesAll.every((x) => x === true);
  };

  static findHandler = ({
    method,
    path,
    kind,
    headers,
    query,
  }: {
    method: HttpMethod;
    path: string;
    headers: { [key: string]: string[] };
    kind?: string | null;
    query: normalizedSearchParams;
  }) => {
    let foundLambda: { event: LambdaEndpoint; handler: ILambdaMock } | undefined;
    const kindToLowerCase = kind?.toLowerCase();

    const foundHandler = Handlers.handlers.find((x) => {
      return x.endpoints
        .filter((e) => (kind ? e.kind == kindToLowerCase : e))
        .find((w) => {
          if (w.kind == "apg") {
            const matchsPath = w.paths.includes(path);
            // if (!matchsPath) {
            //   const canMatch = canMatchWithTrailingSlash(path, w.paths[0]);
            // }
            const isValidApgEvent = matchsPath && (w.methods.includes("ANY") || w.methods.includes(method));
            if (isValidApgEvent) {
              const matches: boolean[] = [isValidApgEvent];

              if (w.headers) {
                matches.push(w.headers.every((h) => h in headers));
              }
              if (w.querystrings) {
                matches.push(w.querystrings.every((q) => q in query));
              }

              const matchesAll = matches.every((x) => x === true);

              if (matchesAll) {
                foundLambda = {
                  event: w,
                  handler: x,
                };
              } else {
                invalidParams(x.name);
              }
              return matchesAll;
            }
          }
          const isValidAlbEvent = w.paths.includes(path) && (w.methods.includes("ANY") || w.methods.includes(method));
          if (isValidAlbEvent) {
            const matches: boolean[] = [isValidAlbEvent];

            if (w.query) {
              matches.push(Handlers.#matchAlbQuery(w.query, query));
            }

            if (w.header) {
              const matchsAllHeaders = w.header.every((x) => headers[x.name.toLowerCase()] && x.values.some((v) => headers[x.name.toLowerCase()].find((s) => s == v)));
              matches.push(matchsAllHeaders);
            }

            const matchesAll = matches.every((x) => x === true);

            if (matchesAll) {
              foundLambda = {
                event: w,
                handler: x,
              };
            } else {
              invalidParams(x.name);
            }

            return matchesAll;
          }
        });
    });

    if (foundHandler) {
      return foundLambda;
    } else {
      // Use Regex to find lambda controller
      const pathComponentsLength = path.split("/").filter(Boolean).length;
      const foundHandler = Handlers.handlers.find((x) =>
        x.endpoints
          .filter((e) => (kind ? e.kind == kindToLowerCase : e))
          .find((w) => {
            const hasPath = w.paths.find((p, i) => {
              const isValid = path.match(w.pathsRegex[i]);
              if (w.kind == "alb") {
                return isValid;
              } else {
                const hasPlus = p.includes("+") || p == "/*";

                if (hasPlus) {
                  return isValid;
                }
                return isValid && p.split("/").filter(Boolean).length == pathComponentsLength;
              }
            });

            const isValidEvent = hasPath && (w.methods.includes("ANY") || w.methods.includes(method));
            if (isValidEvent) {
              const matches: boolean[] = [isValidEvent];

              if (w.kind == "alb") {
                if (w.query) {
                  matches.push(Handlers.#matchAlbQuery(w.query, query));
                }

                if (w.header) {
                  const matchsAllHeaders = w.header.every((x) => headers[x.name.toLowerCase()] && x.values.some((v) => headers[x.name.toLowerCase()].find((s) => s == v)));
                  matches.push(matchsAllHeaders);
                }
              } else {
                if (w.headers) {
                  matches.push(w.headers.every((h) => h in headers));
                }
                if (w.querystrings) {
                  matches.push(w.querystrings.every((q) => q in query));
                }
              }

              const matchesAll = matches.every((x) => x === true);
              if (matchesAll) {
                foundLambda = {
                  event: w,
                  handler: x,
                };
              } else {
                invalidParams(x.name);
              }

              return matchesAll;
            }
          })
      );

      if (foundHandler) {
        return foundLambda;
      }
    }
  };

  addHandler(lambdaController: ILambdaMock) {
    const foundIndex = Handlers.handlers.findIndex((x) => x.name == lambdaController.name && x.esOutputPath == lambdaController.esOutputPath);

    if (foundIndex == -1) {
      Handlers.handlers.push(lambdaController);

      if (lambdaController.endpoints.length) {
        lambdaController.endpoints.forEach((x) => {
          const color = x.kind == "alb" ? "36" : "35";
          x.paths.forEach((p) => {
            this.#printPath(x.methods.join(" "), p, color);
          });
        });
      } else {
        this.#printPath("ANY", `/@invoke/${lambdaController.name}`);
      }
      if (lambdaController.url) {
        this.#printPath("ANY", `/@url/${lambdaController.name}`, "34");
      }
    } else {
      // esbuild rebuild
      if (Handlers.handlers[foundIndex].runtime.startsWith("n")) {
        // @ts-ignore
        Handlers.handlers[foundIndex].clear();
        Handlers.handlers[foundIndex] = lambdaController;
      }
    }
  }

  #printPath(method: string, path: string, color: string = "90") {
    const printingString = `${method}\thttp://localhost:${Handlers.PORT}${path}`;
    console.log(`\x1b[${color}m${printingString}\x1b[0m`);
  }
}
