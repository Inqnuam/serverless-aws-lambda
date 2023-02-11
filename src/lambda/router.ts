import EventEmitter from "events";
import { _buildUniversalEvent, IRequest } from "./express/request";
import { _Response, IResponse } from "./express/response";

export { IRequest, IResponse };
export type NextFunction = (error?: any) => void;
export type RouteMiddleware = (error: any, req: IRequest, res: IResponse, next: NextFunction) => Promise<void> | void;
export type RouteController = (req: IRequest, res: IResponse, next: NextFunction) => Promise<void> | void;

const getMiddleware = (controllers: (RouteController | RouteMiddleware | Function)[], err?: any) => {
  if (err) {
    const foundIndex = controllers.findIndex((x) => x.length == 4);

    if (foundIndex != -1) {
      const errorHandler = controllers[foundIndex];

      controllers.splice(0, foundIndex);

      return errorHandler;
    }
  } else {
    return controllers[0];
  }
};
const isProd = process.env.NODE_ENV == "production";

class Route extends Function {
  controllers: (RouteController | RouteMiddleware | Function)[] = [];

  constructor() {
    super();
    return new Proxy(this, {
      apply: (target, thisArg, args) => target._call(...args),
    });
  }

  async _call(...args: any[]) {
    const controllers = [...this.controllers];
    const req = _buildUniversalEvent(args[0]);
    const context = args[1];
    const callback = args[2];

    let response: any = null;
    const resEmitter = new EventEmitter();

    const resolve = (obj: any) => {
      if (response) {
        return;
      }
      if (typeof obj == "object") {
        response = { ...obj };
        for (const key of Object.keys(response)) {
          if (Array.isArray(response[key])) {
            response[key] = [...obj[key]];
          } else if (response[key] && typeof response[key] == "object") {
            response[key] = { ...obj[key] };
          }
        }
      } else {
        response = obj;
      }

      resEmitter.emit("end");
    };

    const handleError = async (error: any, req: any, res: any, next: any) => {
      try {
        controllers.shift();
        const foundErrorHandler = getMiddleware(controllers, error);
        if (foundErrorHandler) {
          await foundErrorHandler(error, req, res, next);
        } else {
          resolve({ statusCode: 500, body: "Internal Server Error" });
        }
      } catch (err) {
        handleError(err, req, res, next);
      }
    };
    let res = new _Response({ context, resolve, req, locals: {}, callback });
    let err;
    const next = async (error?: any) => {
      err = error;
      controllers.shift();
      const locals = { ...res.locals };
      const previousResponse = { ...res.responseObject };
      res = new _Response({ context, resolve, locals, req, previousResponse, callback });

      const foundHandler = getMiddleware(controllers, err);

      if (foundHandler) {
        try {
          if (foundHandler.length == 4) {
            await (foundHandler as RouteMiddleware)(err, req, res, next);
          } else {
            await (foundHandler as RouteController)(req, res, next);
          }
        } catch (error) {
          await handleError(error, res, res, next);
        }

        if (!response) {
          res.status(404).send(`Cannot ${req.method} ${req.path}`);
        }
      } else {
        if (err) {
          const errorResponse = isProd ? "Not Found" : err.stack ? err.stack : err;
          res.status(404).send(`<pre>${errorResponse}</pre>`);
        }
      }
    };

    await new Promise(async (resolve) => {
      resEmitter.once("end", resolve);
      const foundHandler = getMiddleware(controllers);
      if (foundHandler) {
        try {
          await (foundHandler as RouteController)(req, res, next);
        } catch (error) {
          await handleError(error, res, res, next);
          resolve(undefined);
        }
      } else {
        resolve(undefined);
      }
    });

    return response ?? { statusCode: 204 };
  }

  handle(...controllers: (RouteController | Function)[]) {
    this.controllers.push(...controllers);
    return this;
  }

  use(...middlewares: (RouteMiddleware | RouteController | Function)[]) {
    this.controllers.push(...middlewares);
    return this;
  }
}
export const Router = () => new Route();
