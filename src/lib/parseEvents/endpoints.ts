import { HttpMethod } from "../handlers";
import { LambdaEndpoint } from "../lambdaMock";

export const parseEndpoints = (event: any): LambdaEndpoint | null => {
  const supportedEvents = ["http", "httpApi", "alb"];

  const keys = Object.keys(event);

  if (!keys.length || !supportedEvents.includes(keys[0])) {
    return null;
  }

  let parsendEvent: LambdaEndpoint = {
    kind: "alb",
    paths: [],
    methods: ["ANY"],
  };

  if (event.alb) {
    if (!event.alb.conditions || !event.alb.conditions.path?.length) {
      return null;
    }
    parsendEvent.kind = "alb";
    parsendEvent.paths = event.alb.conditions.path;

    if (event.alb.conditions.method?.length) {
      parsendEvent.methods = event.alb.conditions.method.map((x: string) => x.toUpperCase());
    }
    if (event.alb.multiValueHeaders) {
      parsendEvent.multiValueHeaders = true;
    }
  } else if (event.http || event.httpApi) {
    if (event.http) {
      parsendEvent.version = 1;
      if (event.http.async) {
        parsendEvent.async = true;
      }
    } else {
      parsendEvent.version = 2;
    }

    parsendEvent.kind = "apg";
    const httpEvent = event.http ?? event.httpApi;

    if (typeof httpEvent == "string") {
      // ex: 'PUT /users/update'
      const declarationComponents = httpEvent.split(" ");

      if (declarationComponents.length != 2) {
        return null;
      }

      parsendEvent.methods = [declarationComponents[0] == "*" ? "ANY" : (declarationComponents[0].toUpperCase() as HttpMethod)];
      parsendEvent.paths = [declarationComponents[1]];
    } else if (typeof httpEvent == "object" && httpEvent.path) {
      parsendEvent.paths = [httpEvent.path];

      if (httpEvent.method) {
        parsendEvent.methods = [httpEvent.method == "*" ? "ANY" : httpEvent.method.toUpperCase()];
      }
    } else {
      return null;
    }
  }
  parsendEvent.paths = parsendEvent.paths.map((x) => (x.startsWith("/") ? x : `/${x}`));
  return parsendEvent;
};
