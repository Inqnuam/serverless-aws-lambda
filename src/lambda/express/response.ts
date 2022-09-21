import { RawResponseContent } from "./request";
import { cookie, CookieOptions } from "./cookies";

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
  status: (code: number) => this;
  send: (content?: string) => void;
  json: (content: [] | { [key: string]: any }) => void;
  set: (headerKey: string, headerValue: string) => this;
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
  #req: any;
  constructor(context: any, resolve: Function, locals: any, req: any, previousResponse?: any) {
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

    if (req) {
      this.#req = req;
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
  #setBody(content?: string): this {
    this.responseObject.body = content;
    return this;
  }
  cookie(name: string, value: string, options?: CookieOptions): this {
    this.responseObject.cookies.push(cookie.serialize(name, value, options));

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
  set(headerKey: string, headerValue: string): this {
    this.responseObject.headers[headerKey] = headerValue;
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
