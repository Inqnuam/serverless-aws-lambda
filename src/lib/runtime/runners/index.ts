import type { ServerResponse } from "http";
interface IRunnerInvoke {
  event: any;
  awsRequestId: string;
  info?: any;
  clientContext?: any;
  response?: ServerResponse;
}

export interface Runner {
  mount: () => Promise<any> | any;
  unmount: (lifecycleEnds?: boolean) => Promise<any> | any;
  invoke: (request: IRunnerInvoke) => Promise<any>;
  onComplete: (awsRequestId: string, timeout?: boolean) => any;
}
