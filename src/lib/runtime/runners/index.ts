import type { ServerResponse } from "http";
interface IRunnerInvoke {
  event: any;
  awsRequestId: string;
  info?: any;
  clientContext?: any;
  response?: ServerResponse;
}

export interface Runner {
  isMounted: boolean;
  mount: () => Promise<any> | any;
  unmount: (lifecycleEnds?: boolean) => Promise<any> | any;
  invoke: (request: IRunnerInvoke) => Promise<any>;
  onComplete: (awsRequestId: string, timeout?: boolean) => any;
}
export class UnsupportedRuntime implements Runner {
  err: Error;
  constructor(runtime: string) {
    this.err = new Error(`Local invoke of ${runtime} runtime is currently not supported by serverless-aws-lambda.`);
  }
  isMounted = true;
  mount = () => void 0;
  unmount = () => void 0;
  invoke = async () => {
    throw this.err;
  };
  onComplete = () => void 0;
}
