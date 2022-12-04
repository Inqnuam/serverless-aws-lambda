import { RawAPIResponseContent, RawResponseContent } from "./request";
import { cookie, CookieOptions } from "./cookies";

export type RedirectOptions = [code: number, path: string];

export interface IResponse {
  locals: { [key: string]: any };
  callbackWaitsForEmptyEventLoop: boolean;
  succeed: (content: RawAPIResponseContent) => void;
  fail: (error: any) => void;
  done: (error: any, content: RawAPIResponseContent) => void;
  callback: (error: any, content: RawResponseContent) => void;
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
  status: (code: number) => this;
  send: (content?: string) => void;
  end: (rawContent: RawResponseContent) => void;
  json: (content: [] | { [key: string]: any }) => void;
  set: (header: string | { [key: string]: string }, value?: string) => this;
  get: (headerKey: string) => string;
  redirect: (...redirectOptions: RedirectOptions) => void;
  location(url: string): this;
  links(links: any): this;
  cookie: (name: string, value: string, options?: CookieOptions) => this;
  clearCookie(name: string, options?: CookieOptions): this;
}

export class _Response implements IResponse {
  locals: { [key: string]: any };
  callbackWaitsForEmptyEventLoop: boolean;
  #succeed: (content: RawAPIResponseContent) => void;
  #fail: (error: any) => void;
  #done: (error: any, content: RawAPIResponseContent) => void;
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
  callback: (error: any, content: RawResponseContent) => void;
  responseObject: RawAPIResponseContent = {
    cookies: [],
    isBase64Encoded: false,
    statusCode: 200,
    headers: {},
    body: "",
  };
  #resolve: Function;
  #req: any;
  constructor(init: { context: any; resolve: Function; locals: any; req: any; previousResponse?: any; callback: (error: any, content: RawResponseContent) => void }) {
    this.locals = init.locals;
    this.callbackWaitsForEmptyEventLoop = init.context.callbackWaitsForEmptyEventLoop;
    this.#succeed = init.context.succeed;
    this.#fail = init.context.fail;
    this.#done = init.context.done;
    this.functionVersion = init.context.functionVersion;
    this.functionName = init.context.functionName;
    this.memoryLimitInMB = init.context.memoryLimitInMB;
    this.logGroupName = init.context.logGroupName;
    this.logStreamName = init.context.logStreamName;
    this.clientContext = init.context.clientContext;
    this.identity = init.context.identity;
    this.invokedFunctionArn = init.context.invokedFunctionArn;
    this.awsRequestId = init.context.awsRequestId;
    this.awsRequestId = init.context.awsRequestId;
    this.getRemainingTimeInMillis = init.context.getRemainingTimeInMillis;
    this.callback = init.callback;
    this.#resolve = init.resolve;

    if (init.previousResponse) {
      this.responseObject = init.previousResponse;
    }

    if (init.req) {
      this.#req = init.req;
    }
  }

  succeed(content: RawAPIResponseContent) {
    this.#succeed(content);
  }

  done(err: any, content: RawAPIResponseContent) {
    this.#done(err, content);
  }

  fail(error: any) {
    this.#fail(error);
  }
  #sendResponse() {
    if (!this.responseObject.headers["Content-Type"]) {
      this.type("text/html; charset=utf-8");
    }
    if (!this.responseObject.cookies?.length) {
      delete this.responseObject.cookies;
    }

    this.#resolve({ ...this.responseObject });
  }
  #setBody(content?: string): this {
    this.responseObject.body = content;
    return this;
  }
  cookie(name: string, value: string, options?: CookieOptions): this {
    if (Array.isArray(this.responseObject.cookies)) {
      this.responseObject.cookies.push(cookie.serialize(name, value, options));
    } else {
      this.responseObject.cookies = [cookie.serialize(name, value, options)];
    }

    return this;
  }
  clearCookie(name: string, options?: CookieOptions): this {
    const opts = { expires: new Date(1), path: "/", ...options };
    return this.cookie(name, "", opts);
  }
  status(code: number): this {
    this.responseObject.statusCode = code;
    return this;
  }
  type(contentType: string): this {
    this.responseObject.headers["Content-Type"] = contentType;
    return this;
  }
  #setHeader(headerKey: string, headerValue: any) {
    this.responseObject.headers[headerKey] = headerValue;
  }
  set(...args: any): this {
    const field = args[0];
    if (args.length === 2) {
      const val = args[1];
      var value = Array.isArray(val) ? val.map(String) : String(val);
      this.#setHeader(field, value);
    } else {
      for (var key in field) {
        this.#setHeader(key, field[key]);
      }
    }
    return this;
  }

  get(headerKey: string) {
    return this.responseObject.headers[headerKey];
  }
  json(content: { [key: string]: any }) {
    this.type("application/json").#setBody(JSON.stringify(content)).#sendResponse();
  }

  send(content?: string) {
    this.#setBody(content).#sendResponse();
  }
  end(rawContent: RawResponseContent) {
    this.#resolve({ ...rawContent });
  }

  redirect(...args: RedirectOptions) {
    const code = !isNaN(args[0]) ? args[0] : 302;
    const path = typeof args[0] == "string" ? args[0] : typeof args[1] == "string" ? args[1] : "/";

    this.status(code).location(path).#sendResponse();
  }

  location(url: string): this {
    let loc = url;

    if (url === "back") {
      loc = this.#req.get("Referrer") || "/";
    }
    return this.set("Location", encodeURI(loc));
  }

  links(links: any): this {
    var link = this.get("Link") || "";
    if (link) link += ", ";
    return this.set(
      "Link",
      link +
        Object.keys(links)
          .map(function (rel) {
            return "<" + links[rel] + '>; rel="' + rel + '"';
          })
          .join(", ")
    );
  }
}
