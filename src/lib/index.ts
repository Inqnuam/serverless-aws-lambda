export type NextFunction = (error?: any) => void;
export type errorCallback = (error: any, req: _Request, res: IResponse) => Promise<void> | void;
export type RouteController = (req: _Request, res: IResponse, next: NextFunction) => Promise<void> | void;

export interface RawResponseContent {
  statusCode: number;
  headers: { [key: string]: any };
  body: string | null | undefined;
}
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
export type on = {
  // end: (finalController: RouteController) => Lambda;
  error: (errorHandler: errorCallback) => Lambda;
};
export interface _Request {
  requestContext: { [key: string]: any };
  httpMethod: HttpMethod;
  queryStringParameters: { [key: string]: string };
  headers: { [key: string]: any };
  isBase64Encoded: boolean;
  query: { [key: string]: string };
  body: string | null | undefined;
  method: HttpMethod;
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
  send: (content: string) => void;
  json: (content: [] | { [key: string]: any }) => void;
  set: (headerKey: string, headerValue: string) => IResponse;
  redirect: (...redirectOptions: RedirectOptions) => void;
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
    this.#resolve(this.responseObject);
  }
  #setBody(content: string) {
    this.responseObject.body = content;
    return this;
  }
  status(code: number) {
    this.responseObject.statusCode = code;
    return this;
  }
  type(contentType: string) {
    this.responseObject.headers["content-type"] = contentType;
    return this;
  }
  set(headerKey: string, headerValue: string) {
    this.responseObject.headers[headerKey] = headerValue;
    return this;
  }
  json(content: { [key: string]: any }) {
    this.type("application/json").#setBody(JSON.stringify(content)).#sendResponse();
  }

  send(content: string) {
    this.#setBody(content).#sendResponse();
  }

  redirect(...args: RedirectOptions) {
    const code = !isNaN(args[0]) ? args[0] : 302;
    const path = typeof args[0] == "string" ? args[0] : typeof args[1] == "string" ? args[1] : "/";

    this.status(code).set("Location", path).#sendResponse();
  }
}

const _buildUniversalEvent = (awsAlbEvent) => {
  let universalEvent = { ...awsAlbEvent };
  try {
    universalEvent.query = {};
    universalEvent.method = awsAlbEvent.httpMethod;
    for (const [key, value] of Object.entries(awsAlbEvent.queryStringParameters)) {
      universalEvent.query[key] = decodeURIComponent(value as string);
    }
    if (!awsAlbEvent.isBase64Encoded && awsAlbEvent.headers["content-type"] == "application/json") {
      const body = JSON.parse(awsAlbEvent.body);
      universalEvent.body = body;
    }
  } catch (err) {}
  return universalEvent;
};

function* genControllers(controllers: RouteController[]) {
  for (const func of controllers) {
    yield func;
  }
}

export class Lambda extends Function {
  controllers: RouteController[] = [];
  errorHandler: errorCallback;
  finalHandler: RouteController | null;
  on: on;

  constructor() {
    super();
    this.on = {
      error: (errorHandler: errorCallback) => {
        this.errorHandler = errorHandler;
        return this;
      },
      // end: (finalHandler: RouteController) => {
      //   this.finalHandler = finalHandler;
      //   return this
      // },
    };
    return new Proxy(this, {
      apply: (target, thisArg, args) => target._call(...args),
    });
  }

  async _call(...args) {
    const req = _buildUniversalEvent(args[0]);
    const context = args[1];
    let response: RawResponseContent | null = null;

    const controllersStack = genControllers(this.controllers);
    const resolve = (obj: RawResponseContent) => {
      if (response) {
        return;
      }
      response = obj;
    };

    let res = new _Response(context, resolve, {});
    const next = async (err?: any) => {
      const locals = { ...res.locals };
      const previousResponse = { ...res.responseObject };
      res = new _Response(context, resolve, locals, previousResponse);

      if (err) {
        if (this.errorHandler) {
          try {
            await this.errorHandler(err, req, res);
          } catch (error) {
            res.status(500).type("text/html").send("Unhandled Error");
          }
        } else {
          res.status(500).type("text/html").send("Unhandled Error");
        }

        controllersStack.return();
      }
      const func = controllersStack.next().value;
      if (func) {
        try {
          await func(req, res, next);
        } catch (error) {
          if (this.errorHandler) {
            try {
              await this.errorHandler(error, req, res);
            } catch (error) {
              res.status(500).type("text/html").send("Unhandled Error");
            }
          } else {
            res.status(500).type("text/html").send("Unhandled Error");
          }
          controllersStack.return();
        }
      }
    };

    await next();
    if (response) {
      return response;
    } else {
      return {
        statusCode: 204,
      };
    }
  }

  handler(...controllers: RouteController[]) {
    this.controllers = controllers;
    return this;
  }
}
