import { Server } from "serverless-aws-lambda/server";
import jest from "jest";

const watch = process.argv.includes("--watch");
const exitEvents = ["exit", "SIGINT", "SIGUSR1", "SIGUSR2", "uncaughtException", "SIGTERM"];

async function runTest() {
  try {
    await jest.runCLI(["--config", "./jest.config.js"], ["."]);
  } catch (error) {
    console.error(error);
    process.exit();
  }
}

const server = new Server({
  watch,
  onRebuild: runTest,
});

process.env.SERVER_PORT = (await server.start()).port;

if (watch) {
  exitEvents.forEach((e) => {
    process.on(e, () => {
      server.stop();
      process.exit();
    });
  });
}

await runTest();
if (!watch) {
  server.stop();
}
