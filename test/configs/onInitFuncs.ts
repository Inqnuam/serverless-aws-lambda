import { defineConfig } from "serverless-aws-lambda/defineConfig";

export default defineConfig({
  plugins: [
    {
      name: "dynamic-lambda-injector",
      onInit() {
        this.addLambda({
          name: "fromInitialDefineConfig",
          handler: "test/lambdas/fromInitialDefineConfig.handler",
          environment: {
            ORIGIN: "FROM_ONINIT_HOOK",
          },
        });
      },
    },
  ],
});
