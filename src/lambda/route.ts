import { _buildUniversalEvent, IRequest, RawResponseContent, RawAPIResponseContent } from "./express/request";
import { _Response, IResponse } from "./express/response";

export type NextFunction = (error?: any) => void;
export type RouteMiddleware = (error: any, req: IRequest & { [key: string]: any }, res: IResponse, next: NextFunction) => Promise<void> | void;
export type RouteController = (req: IRequest & { [key: string]: any }, res: IResponse, next: NextFunction) => Promise<void> | void;

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
export class Route extends Function {
  controllers: (RouteController | RouteMiddleware)[] = [];

  constructor() {
    super();
    return new Proxy(this, {
      apply: (target, thisArg, args) => target._call(...args),
    });
  }

  async _call(...args: any[]) {
    const response = await new Promise(async (resolve) => {
      const req = _buildUniversalEvent(args[0]);
      const context = args[1];
      const callback = args[2];
      const controllersStack = genControllers(this.controllers);

      let res = new _Response({ context, resolve, req, locals: {}, callback });
      let currentIndex = 0;

      const next = async (err?: any) => {
        const locals = { ...res.locals };
        const previousResponse = { ...res.responseObject };
        res = new _Response({ context, resolve, locals, req, previousResponse, callback });

        if (err) {
          const foundErrorHandler = getMiddlewareAfter(currentIndex, this.controllers, controllersStack);

          if (foundErrorHandler) {
            try {
              await foundErrorHandler(err, req, res, next);
            } catch (error) {
              process.env.NODE_ENV == "development" && console.error(error);
              res.status(500).send("Unhandled Error");
            }
          } else {
            process.env.NODE_ENV == "development" && console.error(err);
            res.status(500).send("Unhandled Error");
          }

          controllersStack.return();
        }
        const i = controllersStack.next().value;

        if (i) {
          currentIndex = Number(i);
          const func = this.controllers[i as unknown as number];
          try {
            if (func.length == 3) {
              const controller = func as RouteController;
              await controller(req, res, next);
            } else if (func.length == 4) {
              const controller = func as RouteMiddleware;
              await controller(null, req, res, next);
            }
          } catch (error) {
            const foundErrorHandler = getMiddlewareAfter(currentIndex, this.controllers, controllersStack);

            if (foundErrorHandler) {
              try {
                await foundErrorHandler(error, req, res, next);
              } catch (error) {
                process.env.NODE_ENV == "development" && console.error(error);
                res.status(500).send("Unhandled Error");
              }
            } else {
              process.env.NODE_ENV == "development" && console.error(error);
              res.status(500).send("Unhandled Error");
            }
            controllersStack.return();
          }
        }
      };

      await next();
      resolve(null);
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
