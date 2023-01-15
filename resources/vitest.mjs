import { createVitest } from "vitest/node";
import { Server } from "serverless-aws-lambda/server";
const exitEvents = ["exit", "SIGINT", "SIGUSR1", "SIGUSR2", "uncaughtException", "SIGTERM"];

const watch = process.argv.includes("--watch");
let vite;
const server = new Server({
  watch,
  onRebuild: async () => {
    await vite.rerunFiles();
  },
});

if (watch) {
  exitEvents.forEach((e) => {
    process.on(e, () => {
      server.stop();
      process.exit();
    });
  });
}

const { port } = await server.start();

vite = await createVitest("test", {
  watch,
  watchExclude: [".aws_lambda", "src", "serverless.yml", "node_modules", ".git"],
  env: {
    LOCAL_PORT: port,
  },
});

await vite.start();

if (!watch) {
  server.stop();
}
