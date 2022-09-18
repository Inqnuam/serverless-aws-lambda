import { ILambdaMock } from "./lambda";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "ANY";

export class AlbRouter {
  #handlers: {
    GET: ILambdaMock[];
    POST: ILambdaMock[];
    PATCH: ILambdaMock[];
    PUT: ILambdaMock[];
    DELETE: ILambdaMock[];
    OPTIONS: ILambdaMock[];
    HEAD: ILambdaMock[];
    ANY: ILambdaMock[];
  };
  handlers: ILambdaMock[] = [];
  static PORT = 0;
  debug = false;
  constructor(config: any) {
    this.debug = config.debug;

    this.#handlers = {
      GET: [],
      POST: [],
      PATCH: [],
      PUT: [],
      DELETE: [],
      OPTIONS: [],
      HEAD: [],
      ANY: [],
    };
  }
  get(lambdaController: ILambdaMock) {
    const method = "GET";
    this.#setHandler(method, lambdaController);
  }
  GET = this.get;

  post(lambdaController: ILambdaMock) {
    const method = "POST";
    this.#setHandler(method, lambdaController);
  }
  POST = this.post;

  patch(lambdaController: ILambdaMock) {
    const method = "PATCH";
    this.#setHandler(method, lambdaController);
  }
  PATCH = this.patch;

  put(lambdaController: ILambdaMock) {
    const method = "PUT";
    this.#setHandler(method, lambdaController);
  }
  PUT = this.put;

  delete(lambdaController: ILambdaMock) {
    const method = "DELETE";
    this.#setHandler(method, lambdaController);
  }
  DELETE = this.delete;

  options(lambdaController: ILambdaMock) {
    const method = "OPTIONS";
    this.#setHandler(method, lambdaController);
  }
  OPTIONS = this.options;

  head(lambdaController: ILambdaMock) {
    const method = "HEAD";
    this.#setHandler(method, lambdaController);
  }
  HEAD = this.head;

  any(handler: ILambdaMock) {
    this.#handlers.ANY.push(handler);
  }
  ANY = this.any;

  getHandler(method: HttpMethod, path: string, kind?: string) {
    const foundHandler = this.handlers.find((x) =>
      x.endpoints
        .filter((e) => (kind ? e.kind == kind : e))
        .find((w) => {
          return w.paths.includes(path) && (w.methods.includes("ANY") || w.methods.includes(method));
        })
    );

    // const foundHandler = this.#handlers[method]?.find((x: any) => x.path == path);
    if (foundHandler) {
      return foundHandler;
    } else {
      // Use Regex to find lambda controller
      return this.handlers.find((x) =>
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
    this.handlers.push(lambdaController);

    if (this.debug) {
      lambdaController.endpoints.forEach((x) => {
        x.paths.forEach((p) => {
          this.#printPath(x.methods.join(" "), p);
        });
      });
    }
  }
  #setHandler(method: HttpMethod, lambdaController: ILambdaMock) {
    // const foundIndex = this.#handlers[method].findIndex((x) => x.path == lambdaController.path);
    // if (foundIndex == -1) {
    //   this.#handlers[method].push(lambdaController);
    //   if (this.debug) {
    //     this.#printPath(method, lambdaController);
    //   }
    // } else {
    //   this.#handlers[method][foundIndex] = lambdaController;
    // }
  }

  #printPath(method: string, path: string) {
    const printingString = `${method}\thttp://localhost:${AlbRouter.PORT}${path}`;
    console.log(`\x1b[36m${printingString}\x1b[0m`);
  }
}
