import { defineConfig } from "serverless-aws-lambda/defineConfig";

export default defineConfig({
  functions: [
    {
      name: "fromInitialDefineConfig",
      handler: "test/lambdas/fromInitialDefineConfig.handler",
      environment: {
        ORIGIN: "INITIAL",
      },
    },
  ],
});
