export interface LambdaConfig {
  name: string;
  description?: string;
  environment?: any;
  vpc?: string;
  timeout?: number;
  memorySize?: number;
  reservedConcurrency?: number;
}

type Object = {
  [key: string]: any;
};

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
export interface Request {
  query: Object;
  body: any;
  method: HttpMethod;
}

export interface Response {
  locals: Object;
  set: (key: string, value: string) => Response;
  status: (code: number) => Response;
  type: (contentType: string) => Response;
  json: (value: { [key: string]: any }) => void;
  send: (content: any) => void;
  redirect: (code: number, path: string) => void;
  callbackWaitsForEmptyEventLoop: boolean;
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
}

export type errorCallback = (error: any, req: Request, res: Response) => void;
export type NextFunction = (error?: any) => void;
export type routeMiddlewares = (req: Request, res: Response, next: NextFunction) => Promise<void> | void;

export class Lambda {
  constructor() {}

  handler(...middlewares: routeMiddlewares[]) {}
  onError(callback: errorCallback) {}
}
