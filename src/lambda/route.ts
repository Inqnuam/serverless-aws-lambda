import EventEmitter from "events";
import { _buildUniversalEvent, IRequest, RawResponseContent } from "./express/request";
import { _Response, IResponse } from "./express/response";

export type NextFunction = (error?: any) => void;
export type RouteMiddleware = (error: any, req: IRequest, res: IResponse, next: NextFunction) => Promise<void> | void;
export type RouteController = (req: IRequest, res: IResponse, next: NextFunction) => Promise<void> | void;

function* genControllers(controllers: (RouteController | RouteMiddleware)[]) {
  for (const func in controllers) {
    yield func;
  }
}

const getMiddlewareAfter = (currentPosition: number, controllers: (RouteController | RouteMiddleware)[], controllersStack: Generator<string, void, unknown>) => {
  let func: Function | null = null;
  const foundIndex = controllers.findIndex((x, index) => {
    return index > currentPosition && x.length == 4;
  });

  if (foundIndex != -1) {
    for (let i = currentPosition; i < foundIndex; i++) {
      func = controllers[controllersStack.next().value as unknown as number];
    }
  }

  return func;
};

const error500 = {
  statsCode: 500,
  headers: {
    "Content-Type": "text/html; charset=utf-8",
  },
  body: "Unhandled Error",
};
const get500Response = (error: any) => {
  process.env.NODE_ENV == "development" && console.error(error);
  return error500;
};
export class Route extends Function {
  controllers: (RouteController | RouteMiddleware)[] = [];

  constructor() {
    super();
    return new Proxy(this, {
      apply: (target, thisArg, args) => target._call(...args),
    });
  }

  async _call(...args: any[]) {
    const req = _buildUniversalEvent(args[0]);
    const context = args[1];
    const callback = args[2];

    const controllersStack = genControllers(this.controllers);
    const resEmitter = new EventEmitter();

    const resolve = (obj: any) => {
      let uniqueResponse = obj && typeof obj == "object" ? { ...obj } : obj;

      Object.keys(uniqueResponse).forEach((key) => {
        if (Array.isArray(uniqueResponse[key])) {
          uniqueResponse[key] = [...obj[key]];
        } else if (uniqueResponse[key] && typeof uniqueResponse[key] == "object") {
          uniqueResponse[key] = { ...obj[key] };
        }
      });
      resEmitter.emit("end", uniqueResponse);
    };

    let res = new _Response({ context, resolve, req, locals: {}, callback });
    let currentIndex = 0;
    const next = async (err?: any) => {
      const locals = { ...res.locals };
      const previousResponse = { ...res.responseObject };
      res = new _Response({ context, resolve, req, locals, previousResponse, callback });

      if (err) {
        const foundErrorHandler = getMiddlewareAfter(currentIndex, this.controllers, controllersStack);

        if (foundErrorHandler) {
          try {
            await foundErrorHandler(err, req, res, next);
          } catch (error) {
            resEmitter.emit("end", get500Response(error));
          }
        } else {
          resEmitter.emit("end", get500Response(err));
        }

        controllersStack.return();
      }
      const i = controllersStack.next().value;

      if (i) {
        currentIndex = Number(i);
        const func = this.controllers[i as unknown as number];
        try {
          if (func.length == 4) {
            const controller = func as RouteMiddleware;
            await controller(null, req, res, next);
          } else if (typeof func == "function") {
            const controller = func as RouteController;
            await controller(req, res, next);
          }
        } catch (error) {
          const foundErrorHandler = getMiddlewareAfter(currentIndex, this.controllers, controllersStack);

          if (foundErrorHandler) {
            try {
              await foundErrorHandler(error, req, res, next);
            } catch (error) {
              resEmitter.emit("end", get500Response(error));
            }
          } else {
            resEmitter.emit("end", get500Response(error));
          }
          controllersStack.return();
        }
      }
    };

    const response = await new Promise(async (resolve) => {
      let isResolved = false;
      resEmitter.once("end", (data: any) => {
        isResolved = true;
        resolve(data);
      });
      await next();

      if (!isResolved) {
        resolve(null);
      }
    });

    return response ?? { statusCode: 204 };
  }

  handle(...controllers: RouteController[]) {
    this.controllers.push(...controllers);
    return this;
  }

  use(...middlewares: RouteMiddleware[]) {
    this.controllers.push(...middlewares);
    return this;
  }
}
