import { Server } from "serverless-aws-lambda/server";
import jest from "jest";

const watch = process.argv.includes("--watch");
const exitEvents = ["exit", "SIGINT", "SIGUSR1", "SIGUSR2", "uncaughtException", "SIGTERM"];

let server;
async function runTest() {
  try {
    await jest.run(["--config", "./jest.config.js"]);
  } catch (error) {
    console.error(error);
    server.stop();
    process.exit();
  }
}

server = new Server({
  watch,
  onRebuild: runTest,
});

process.env.LOCAL_PORT = (await server.start()).port;

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
