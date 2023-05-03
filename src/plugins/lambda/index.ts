import type { OfflineRequest } from "../../defineConfig";

import { invokeRequests } from "./invokeRequests";
import { functionUrlInvoke } from "./functionUrlInvoke";
import { responseStreamingInvoke } from "./responseStreamingInvoke";

export const LambdaRequests: OfflineRequest[] = [invokeRequests, responseStreamingInvoke, functionUrlInvoke];
