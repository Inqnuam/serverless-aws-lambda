import { ILambdaMock, LambdaEndpoint } from "./lambdaMock";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "ANY";

export class Handlers {
  #handlers: ILambdaMock[] = [];
  static PORT = 0;
  debug = false;
  constructor(config: any) {
    this.debug = config.debug;
  }

  getHandlersByTopicArn(body: any) {
    const arnComponent = body.TopicArn.split(":");

    const name = arnComponent[arnComponent.length - 1];

    const foundHandlers = this.#handlers.filter((x) => {
      const foundEvents = x.sns.filter((foundEvent) => {
        if (foundEvent.name !== name) {
          return false;
        }

        if (!foundEvent) {
          return false;
        }

        if (!foundEvent.filter) {
          return true;
        }

        const filterKeys = Object.keys(foundEvent.filter);

        let filterContext: any = {};

        if (foundEvent.filterScope == "MessageAttributes") {
          if (!body.MessageAttributes) {
            return false;
          }

          for (const [k, v] of Object.entries(body.MessageAttributes)) {
            filterContext[k] = (v as any).Value;
          }
        } else if (foundEvent.filterScope == "MessageBody") {
          if (body.MessageStructure != "json" || !body.Message) {
            return false;
          }
          try {
            filterContext = JSON.parse(body.Message);
          } catch (error) {}
        }

        if (!filterKeys.every((x) => x in filterContext)) {
          return false;
        }

        let hasRequiredKey = false;

        for (const k of filterKeys) {
          if (foundEvent.filter[k].some((x: string) => x == filterContext[k])) {
            hasRequiredKey = true;
            break;
          }
        }

        return hasRequiredKey;
      });

      return foundEvents.length ? true : false;
    });

    return foundHandlers;
  }
  getHandlerByName(lambdaName?: string | null) {
    if (!lambdaName) {
      return;
    }
    const components = lambdaName.split("/");

    const name = components[1] == "@invoke" ? components[2] : components[3];
    return this.#handlers.find((x) => x.name == name || x.outName == name);
  }
  getHandler(method: HttpMethod, path: string, kind?: string | null) {
    const hasNotWilcard = !path.includes("*");
    const hasNotBrackets = !path.includes("{") && !path.includes("}");

    let foundLambda: { event: LambdaEndpoint; handler: ILambdaMock } | undefined;

    const foundHandler = this.#handlers.find((x) => {
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
    const foundIndex = this.#handlers.findIndex((x) => x.name == lambdaController.name && x.esOutputPath == lambdaController.esOutputPath);

    if (foundIndex == -1) {
      this.#handlers.push(lambdaController);
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
      this.#handlers[foundIndex] = lambdaController;
    }
  }

  #printPath(method: string, path: string) {
    const printingString = `${method}\thttp://localhost:${Handlers.PORT}${path}`;
    console.log(`\x1b[36m${printingString}\x1b[0m`);
  }
}
