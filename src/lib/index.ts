import EventEmitter from "events";
import { cookie, SetCookieOptions } from "./cookies";
import { HttpMethod } from "./router";

export type NextFunction = (error?: any) => void;
export type RouteMiddleware = (error: any, req: IRequest, res: IResponse, next: NextFunction) => Promise<void> | void;
export type RouteController = (req: IRequest, res: IResponse, next: NextFunction) => Promise<void> | void;




export interface RawResponseContent {
  cookies: string[];
  isBase64Encoded: boolean;
  statusCode: number;
  headers: { [key: string]: any };
  body: string | null | undefined;
}

export interface IRequest {
  requestContext: { [key: string]: any };
  httpMethod: HttpMethod;
  queryStringParameters: { [key: string]: string };
  path: string;
  headers: { [key: string]: any };
  isBase64Encoded: boolean;
  query: { [key: string]: string };
  body: string | null | undefined;
  method: HttpMethod;
  cookies: { [key: string]: any };
  get: (headerField: string) => { [key: string]: any } | undefined;
  params: string[];
}

export type RedirectOptions = [code: number, path: string];

export interface IResponse {
  locals: { [key: string]: any };
  callbackWaitsForEmptyEventLoop: boolean;
  succeed: (content: RawResponseContent) => void;
  fail: (error: any) => void;
  done: (error: any, content: RawResponseContent) => void;
  functionVersion: string;
  functionName: string;
  memoryLimitInMB: string;
  logGroupName: string;
  logStreamName: string;
  clientContext: any;
  identity: any;
  invokedFunctionArn: string;
  awsRequestId: string;
  getRemainingTimeInMillis: Function;
  status: (code: number) => IResponse;
  send: (content?: string) => void;
  json: (content: [] | { [key: string]: any }) => void;
  set: (headerKey: string, headerValue: string) => IResponse;
  redirect: (...redirectOptions: RedirectOptions) => void;
  cookie: (name: string, value: string, options?: SetCookieOptions) => IResponse;
}

class _Response implements IResponse {
  locals: { [key: string]: any };
  callbackWaitsForEmptyEventLoop: boolean;
  #succeed: (content: RawResponseContent) => void;
  #fail: (error: any) => void;
  #done: (error: any, content: RawResponseContent) => void;
  functionVersion: string;
  functionName: string;
  memoryLimitInMB: string;
  logGroupName: string;
  logStreamName: string;
  clientContext: any;
  identity: any;
  invokedFunctionArn: string;
  awsRequestId: string;
  getRemainingTimeInMillis: () => number;

  responseObject: RawResponseContent = {
    cookies: [],
    isBase64Encoded: false,
    statusCode: 200,
    headers: {},
    body: "",
  };
  #resolve: Function;

  constructor(context: any, resolve: Function, locals: any, previousResponse?: any) {
    this.locals = locals;
    this.callbackWaitsForEmptyEventLoop = context.callbackWaitsForEmptyEventLoop;
    this.#succeed = context.succeed;
    this.#fail = context.fail;
    this.#done = context.done;
    this.functionVersion = context.functionVersion;
    this.functionName = context.functionName;
    this.memoryLimitInMB = context.memoryLimitInMB;
    this.logGroupName = context.logGroupName;
    this.logStreamName = context.logStreamName;
    this.clientContext = context.clientContext;
    this.identity = context.identity;
    this.invokedFunctionArn = context.invokedFunctionArn;
    this.awsRequestId = context.awsRequestId;
    this.awsRequestId = context.awsRequestId;
    this.getRemainingTimeInMillis = context.getRemainingTimeInMillis;
    this.#resolve = resolve;
    if (previousResponse) {
      this.responseObject = previousResponse;
    }
  }

  succeed(content: RawResponseContent) {
    this.#succeed(content);
  }

  done(err: any, content: RawResponseContent) {
    this.#done(err, content);
  }

  fail(error: any) {
    this.#fail(error);
  }
  #sendResponse() {
    if (!this.responseObject.headers["Content-Type"]) {
      this.type("text/html");
    }
    this.#resolve(this.responseObject);
  }
  #setBody(content?: string) {
    this.responseObject.body = content;
    return this;
  }
  cookie(name: string, value: string, options?: SetCookieOptions | undefined) {
    this.responseObject.cookies.push(cookie.serialize(name, value, options));

    return this;
  }
  status(code: number) {
    this.responseObject.statusCode = code;
    return this;
  }
  type(contentType: string) {
    this.responseObject.headers["Content-Type"] = contentType;
    return this;
  }
  set(headerKey: string, headerValue: string) {
    this.responseObject.headers[headerKey] = headerValue;
    return this;
  }
  json(content: { [key: string]: any }) {
    this.type("application/json").#setBody(JSON.stringify(content)).#sendResponse();
  }

  send(content?: string) {
    this.#setBody(content).#sendResponse();
  }

  redirect(...args: RedirectOptions) {
    const code = !isNaN(args[0]) ? args[0] : 302;
    const path = typeof args[0] == "string" ? args[0] : typeof args[1] == "string" ? args[1] : "/";

    this.status(code).set("Location", path).#sendResponse();
  }
}

const _buildUniversalEvent = (awsAlbEvent: any) => {
  let universalEvent = { ...awsAlbEvent };
  try {
    universalEvent.method = awsAlbEvent.httpMethod;
    universalEvent.query = {};

    for (const [key, value] of Object.entries(awsAlbEvent.queryStringParameters)) {
      universalEvent.query[key] = decodeURIComponent(value as string);
    }
    if (!awsAlbEvent.isBase64Encoded && awsAlbEvent.headers["content-type"] == "application/json") {
      const body = JSON.parse(awsAlbEvent.body);
      universalEvent.body = body;
    }
    universalEvent.cookies = typeof awsAlbEvent.headers.cookie == "string" ? cookie.parse(awsAlbEvent.headers.cookie) : {};
    universalEvent.get = (headerField: string) => {
      return awsAlbEvent.headers[headerField.toLowerCase()];
    };
    let reqPath = decodeURIComponent(universalEvent.path);

    // const queryStartPos = reqPath.lastIndexOf("?");
    // if (queryStartPos != -1) {
    //   reqPath = reqPath.slice(0, queryStartPos);
    // }

    universalEvent.params = reqPath.split("/").filter((x) => x);
  } catch (err) {}

  return universalEvent;
};

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
export class Lambda extends Function {
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
    let response: RawResponseContent | null = null;

    const controllersStack = genControllers(this.controllers);
    const resEmitter = new EventEmitter();

    const resolve = (obj: RawResponseContent) => {
      if (response) {
        return;
      }
      response = obj;
      resEmitter.emit("end");
    };

    let res = new _Response(context, resolve, {});
    let currentIndex = 0;
    const next = async (err?: any) => {
      const locals = { ...res.locals };
      const previousResponse = { ...res.responseObject };
      res = new _Response(context, resolve, locals, previousResponse);

      if (err) {
        const foundErrorHandler = getMiddlewareAfter(currentIndex, this.controllers, controllersStack);

        if (foundErrorHandler) {
          try {
            await foundErrorHandler(err, req, res, next);
            if (!response) {
              res.status(204).send();
            }
          } catch (error) {
            res.status(500).send("Unhandled Error");
          }
        } else {
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
              if (!response) {
                res.status(204).send();
              }
            } catch (error) {
              res.status(500).send("Unhandled Error");
            }
          } else {
            res.status(500).send("Unhandled Error");
          }
          controllersStack.return();
        }
      }
    };

    await new Promise(async (resolve) => {
      resEmitter.once("end", resolve);
      await next();
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
