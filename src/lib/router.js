class AlbRouter {
  #handlers = {
    GET: [],
    POST: [],
    PATCH: [],
    PUT: [],
    DELETE: [],
    OPTIONS: [],
    HEAD: [],
    ANY: null,
  };
  static PORT = 0;
  debug = false;
  constructor(config) {
    this.debug = config.debug;
  }
  get(lambdaController) {
    const method = "GET";
    this.#setHandler(method, lambdaController);
  }
  GET = this.get;

  post(lambdaController) {
    const method = "POST";
    this.#setHandler(method, lambdaController);
  }
  POST = this.post;

  patch(lambdaController) {
    const method = "PATCH";
    this.#setHandler(method, lambdaController);
  }
  PATCH = this.patch;

  put(lambdaController) {
    const method = "PUT";
    this.#setHandler(method, lambdaController);
  }
  PUT = this.put;

  update(lambdaController) {
    const method = "UPDATE";
    this.#setHandler(method, lambdaController);
  }
  UPDATE = this.update;

  delete(lambdaController) {
    const method = "DELETE";
    this.#setHandler(method, lambdaController);
  }
  DELETE = this.delete;

  options(lambdaController) {
    const method = "OPTIONS";
    this.#setHandler(method, lambdaController);
  }
  OPTIONS = this.options;

  head(lambdaController) {
    const method = "HEAD";
    this.#setHandler(method, lambdaController);
  }
  HEAD = this.head;

  any(handler) {
    this.#handlers.ANY = handler;
  }
  ANY = this.any;

  getHandler(method, path) {
    const foundHandler = this.#handlers[method]?.find((x) => x.path == path);
    if (foundHandler) {
      return foundHandler;
    } else {
      // Use Regex to find lambda controller

      return this.#handlers[method]?.find((x) => {
        const rawPattern = x.path.replace(/\*/g, ".*").replace(/\//g, "\\/");
        const pattern = new RegExp(`^${rawPattern}$`, "g");

        return pattern.test(path);
      });
    }
  }

  #setHandler(method, lambdaController) {
    const foundIndex = this.#handlers[method].findIndex((x) => x.path == lambdaController.path);

    if (foundIndex == -1) {
      this.#handlers[method].push(lambdaController);
      if (this.debug) {
        this.#printPath(method, lambdaController);
      }
    } else {
      this.#handlers[method][foundIndex] = lambdaController;
    }
  }

  #printPath(method, lambdaController) {
    const printingString = `${method}\thttp://localhost:${this.PORT}${lambdaController.path}`;
    console.log(`\x1b[36m${printingString}\x1b[0m`);
  }
}

module.exports = AlbRouter;
