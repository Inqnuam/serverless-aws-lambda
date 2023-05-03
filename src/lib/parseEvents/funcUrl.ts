import type { LambdaEndpoint } from "../runtime/rapidApi";

export const parseFuncUrl = (lambda: any) => {
  if (!lambda.url) {
    return;
  }
  let url: LambdaEndpoint = {
    kind: "url",
    proxy: "url",
    version: 2,
    methods: ["ANY"],
    paths: ["/*"],
    pathsRegex: [],
    stream: typeof lambda.url == "object" && lambda.url.invoke == "response_stream",
  };
  return url;
};
