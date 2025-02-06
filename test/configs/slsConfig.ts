import { defineConfig } from "serverless-aws-lambda/defineConfig";
import { s3Plugin } from "serverless-aws-lambda/s3";
export default defineConfig({
  plugins: [s3Plugin({ persist: false })],
});
