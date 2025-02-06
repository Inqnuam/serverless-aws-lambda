import type { OfflineRequest } from "../../defineConfig";

import { creatInvokeRequestsHandler } from "./invokeRequests";
import { createFunctionUrlInvokeHandler } from "./functionUrlInvoke";
import { createResponseStreamingInvokeHandler } from "./responseStreamingInvoke";
import type { ILambdaMock } from "../../lib/runtime/rapidApi";

export const createLambdaRequestsHandlers = (handlers: ILambdaMock[]): OfflineRequest[] => [
  creatInvokeRequestsHandler(handlers),
  createResponseStreamingInvokeHandler(handlers),
  createFunctionUrlInvokeHandler(handlers),
];
