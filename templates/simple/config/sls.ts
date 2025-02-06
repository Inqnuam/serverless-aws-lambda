import { defineConfig } from "serverless-aws-lambda/defineConfig";
import { vitestPlugin } from "serverless-aws-lambda-vitest";

const test = process.argv.includes("vitest");
const oneshot = test && process.argv.includes("oneshot");

export default defineConfig({
  esbuild: {
    format: "esm",
  },
  server: {
    port: 7500,
  },
  plugins: [test && vitestPlugin({ configFile: "./vitest.e2e.config.mts", oneshot })],
});
