import type { HttpMethod } from "../server/handlers";
import { log } from "../utils/colorize";
import { compileAjvSchema } from "../utils/compileAjvSchema";

const pathPartsRegex = /^(\{[\w.:-]+\+?\}|[a-zA-Z0-9.:_-]+)$/;

interface IAlbQuery {
  Key?: string;
  Value: string;
}
type query = IAlbQuery[];
export interface LambdaEndpoint {
  kind: "alb" | "apg" | "url";
  proxy?: "url" | "http" | "httpApi";
  paths: string[];
  pathsRegex: RegExp[];
  methods: HttpMethod[];
  async?: boolean;
  multiValueHeaders?: boolean;
  version?: 1 | 2;
  header?: {
    name: string;
    values: string[];
  }[];
  query?: query[];
  headers?: string[];
  querystrings?: string[];
  requestPaths?: string[];
  stream?: boolean;
  private?: boolean;
  schema?: any;
}
const supportedEvents = ["http", "httpApi", "alb"];
export const parseEndpoints = (event: any, httpApiPayload: LambdaEndpoint["version"], provider: Record<string, any>): LambdaEndpoint | null => {
  const keys = Object.keys(event);

  if (!keys.length || !supportedEvents.includes(keys[0])) {
    return null;
  }

  let parsendEvent: LambdaEndpoint = {
    kind: "alb",
    paths: [],
    pathsRegex: [],
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

    if (event.alb.conditions.header) {
      parsendEvent.header = Array.isArray(event.alb.conditions.header) ? event.alb.conditions.header : [event.alb.conditions.header];
    }

    if (event.alb.conditions.query) {
      if (Array.isArray(event.alb.conditions.query)) {
        parsendEvent.query = event.alb.conditions.query;
      } else if (typeof event.alb.conditions.query == "object") {
        const entries = Object.entries(event.alb.conditions.query) as unknown as [string, string];

        const query = entries.map(([Key, Value]) => {
          return { Key, Value };
        });
        parsendEvent.query = [query];
      }
    }
  } else if (event.http || event.httpApi) {
    parsendEvent.kind = "apg";

    if (event.http) {
      parsendEvent.version = 1;
      parsendEvent.proxy = "http";
    } else {
      parsendEvent.version = httpApiPayload;
      parsendEvent.proxy = "httpApi";
    }
    const httpEvent = event.http ?? event.httpApi;

    if (typeof httpEvent == "string") {
      if (httpEvent == "*") {
        parsendEvent.methods = ["ANY"];
        parsendEvent.paths = ["*"];
      } else {
        // ex: 'PUT /users/update'
        const declarationComponents = httpEvent.split(" ");

        if (declarationComponents.length != 2) {
          return null;
        }
        const [method, path] = declarationComponents;

        parsendEvent.methods = [method == "*" ? "ANY" : (method.toUpperCase() as HttpMethod)];
        parsendEvent.paths = [path];
      }
    } else if (typeof httpEvent == "object" && httpEvent.path) {
      parsendEvent.paths = [httpEvent.path];

      if (httpEvent.method) {
        parsendEvent.methods = [httpEvent.method == "*" ? "ANY" : httpEvent.method.toUpperCase()];
      }

      // RESI API
      if (event.http) {
        if (event.http.async) {
          parsendEvent.async = event.http.async;
        }

        if (event.http.request) {
          const request = event.http.request;
          if (request.parameters) {
            const { headers, querystrings, paths } = request.parameters;
            if (headers) {
              parsendEvent.headers = Object.keys(headers).filter((x) => headers[x]);
            }
            if (querystrings) {
              parsendEvent.querystrings = Object.keys(querystrings).filter((x) => querystrings[x]);
            }

            if (paths) {
              parsendEvent.requestPaths = Object.keys(paths).filter((x) => paths[x]);
            }
          }

          if (request.schemas) {
            let jsonReqTypeSchema = request.schemas["application/json"] ?? request.schemas["application/json; charset=utf-8"];
            if (jsonReqTypeSchema) {
              if (typeof jsonReqTypeSchema == "string") {
                const schema = provider.apiGateway?.request?.schemas?.[jsonReqTypeSchema]?.schema;
                if (!schema) {
                  throw new Error(`Can not find JSON Schema "${jsonReqTypeSchema}"`);
                }
                jsonReqTypeSchema = schema;
              } else if (typeof jsonReqTypeSchema == "object" && typeof jsonReqTypeSchema.schema == "object") {
                jsonReqTypeSchema = jsonReqTypeSchema.schema;
              }

              parsendEvent.schema = compileAjvSchema(jsonReqTypeSchema);
            } else {
              console.warn("Unsupported schema validator definition:", request.schemas);
            }
          }
        }

        if (event.http.private) {
          parsendEvent.private = true;
        }
      }
    } else {
      return null;
    }

    const pathParts = parsendEvent.paths[0].split("/").filter(Boolean);
    const hasIndalidPath = pathParts.find((x) => !x.match(pathPartsRegex));
    if (hasIndalidPath && httpEvent != "*") {
      log.YELLOW(`Invalid path parts: ${hasIndalidPath}`);
      return null;
    }
  }
  parsendEvent.paths = parsendEvent.paths.map((x) => (x.startsWith("/") ? x : `/${x}`));

  if (event.alb) {
    parsendEvent.paths.forEach((p) => {
      const AlbAnyPathMatch = p.replace(/\*/g, ".*").replace(/\//g, "\\/");
      const AlbPattern = new RegExp(`^${AlbAnyPathMatch}$`, "g");
      parsendEvent.pathsRegex.push(AlbPattern);
    });
  } else {
    const reqPath = parsendEvent.paths[0];
    if (event.http && reqPath && reqPath.endsWith("/") && reqPath.length > 1) {
      parsendEvent.paths[0] = reqPath.slice(0, -1);
    }

    let ApgPathPartMatch = parsendEvent.paths[0];
    ApgPathPartMatch = ApgPathPartMatch.replace("*", ".*")
      .replace(/\{[\w.:-]+\+?\}/g, ".*")
      .replace(/\//g, "\\/");

    if (event.http && !ApgPathPartMatch.endsWith("/")) {
      ApgPathPartMatch += "\\/?";
    }

    parsendEvent.pathsRegex = [new RegExp(`^${ApgPathPartMatch}$`, "g")];
    const endsWithSlash = parsendEvent.paths.find((x) => x.endsWith("/"));
    if (event.httpApi && endsWithSlash && endsWithSlash != "/") {
      log.YELLOW(`Invalid path, httpApi route must not end with '/': ${endsWithSlash}`);
      return null;
    }
  }

  return parsendEvent;
};
