export interface LambdaConfig {
  name: string;
  description?: string;
  environment?: any;
  vpc?: string;
  timeout?: number;
  memorySize?: number;
  reservedConcurrency?: number;
}
export type errorCallback = (error: any, req: any, res: Function) => void;
export type NextFunction = (error?: any) => void;
export type routeMiddlewares = (req: any, res: any, next: NextFunction) => Promise<void> | void;

export class Lambda {
  constructor() {}

  handler(...middlewares: routeMiddlewares[]) {}

  onError(callback: errorCallback) {}
}
