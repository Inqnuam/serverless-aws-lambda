import { RawResponseContent } from "./request";
import { cookie, CookieOptions } from "./cookies";

export type RedirectOptions = [code: number, path: string];
type Stringifiable = [] | { [key: string]: any } | null | boolean;
export interface IResponse {
  locals: { [key: string]: any };
  callbackWaitsForEmptyEventLoop: boolean;
  succeed: (content: any) => void;
  fail: (error: any) => void;
  done: (error: any, content: any) => void;
  callback: (error: any, content: any) => void;
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
  sendStatus: (code: number) => void;
  send: (content?: string | Buffer) => void;
  end: (rawContent: any) => void;
  json: (content: Stringifiable) => void;
  set: (header: string | { [key: string]: string }, value?: string) => this;
  setHeader: (header: string | { [key: string]: string }, value?: string) => this;
  get: (headerKey: string) => string;
  getHeader: (headerKey: string) => string;
  redirect: (...redirectOptions: RedirectOptions) => void;
  location(url: string): this;
  links(links: any): this;
  cookie: (name: string, value: string, options?: CookieOptions) => this;
  clearCookie(name: string, options?: CookieOptions): this;
}

const getSetCookieKey = (i: number) => {
  if (i == 0 || i > 8) {
    return "Set-Cookie";
  } else {
    const sc = ["s", "e", "t", "c", "o", "o", "k", "i", "e"];
    sc[i] = sc[i].toUpperCase();

    return [...sc.slice(0, 3), "-", ...sc.slice(3)].join("");
  }
};

export class _Response implements IResponse {
  locals: { [key: string]: any };
  callbackWaitsForEmptyEventLoop: boolean;
  #succeed: (content: any) => void;
  #fail: (error: any) => void;
  #done: (error: any, content: any) => void;
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
  responseObject: any = {
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

  succeed(content: any) {
    this.#succeed(content);
  }

  done(err: any, content: any) {
    this.#done(err, content);
  }

  fail(error: any) {
    this.#fail(error);
  }
  #sendResponse() {
    if (!this.responseObject.headers["Content-Type"]) {
      if (this.#req.requestContext?.elb) {
        this.type("text/html; charset=utf-8");
      } else {
        this.type("application/json");
      }
    }
    if (!this.responseObject.cookies?.length) {
      delete this.responseObject.cookies;
    } else {
      if (this.#req.version == "1.0") {
        this.responseObject.multiValueHeaders = {};
        this.responseObject.multiValueHeaders["Set-Cookie"] = [...this.responseObject.cookies];
        delete this.responseObject.cookies;
      }
      if (this.#req.requestContext?.elb && !this.#req.multiValueHeaders && !this.#req.multiValueQueryStringParameters) {
        (this.responseObject.cookies as []).forEach((cookie, i) => {
          this.#setHeader(getSetCookieKey(i), cookie);
        });

        delete this.responseObject.cookies;
      }
    }

    if (this.#req.requestContext?.elb && (this.#req.multiValueHeaders || this.#req.multiValueQueryStringParameters)) {
      this.responseObject.multiValueHeaders = {};

      for (const [key, val] of Object.entries(this.responseObject.headers)) {
        this.responseObject.multiValueHeaders[key] = [val];
      }
      if (this.responseObject.cookies?.length) {
        this.responseObject.multiValueHeaders["Set-Cookie"] = [...this.responseObject.cookies];
        delete this.responseObject.cookies;
      }
      delete this.responseObject.headers;
    }
    this.#resolve({ ...this.responseObject });
  }
  #setBody(content?: string | Buffer): this {
    if (content instanceof Buffer) {
      this.responseObject.body = content.toString("base64");
      this.responseObject.isBase64Encoded = true;
    } else {
      this.responseObject.body = content;
    }
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
  sendStatus(code: number) {
    this.status(code).#sendResponse();
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
  setHeader = this.set;
  get(headerKey: string) {
    return this.responseObject.headers[headerKey];
  }
  getHeader = this.get;
  json(content: Stringifiable) {
    this.type("application/json").#setBody(JSON.stringify(content)).#sendResponse();
  }

  send(content?: string | Buffer) {
    this.#setBody(content).#sendResponse();
  }
  end(rawContent: any) {
    let resContent = undefined;
    if (Array.isArray(rawContent)) {
      resContent = [...rawContent];
    } else if (typeof rawContent == "object") {
      resContent = { ...rawContent };
    } else {
      resContent = rawContent;
    }
    this.#resolve(resContent);
  }

  redirect(...args: RedirectOptions) {
    const code = !isNaN(args[0]) ? args[0] : 302;
    const path = typeof args[0] == "string" ? args[0] : typeof args[1] == "string" ? args[1] : "/";

    this.status(code).location(path).#sendResponse();
  }

  location(url: string): this {
    let loc = url;

    if (url === "back") {
      loc = this.#req.get("Referrer") || this.#req.get("Referer") || "/";
    }
    return this.set("Location", encodeURI(loc));
  }

  links(links: any): this {
    let link = this.get("Link") || "";
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
