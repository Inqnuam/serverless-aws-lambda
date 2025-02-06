import { run } from "serverless-aws-lambda/standalone";
import { describe, it, expect } from "vitest";
import { callLambda } from "./utils/callLambda";

describe("defineConfig", () => {
  it("Should set functions from defineConfig options", async () => {
    await using server = await run({
      configPath: "test/configs/initialFuncs.ts",
    });

    const res = await callLambda(server.port, "fromInitialDefineConfig");

    expect(res).deep.eq({ ok: true, ORIGIN: "INITIAL" });
  });

  it("Should add lambdas from defineConfig onInit hook", async () => {
    await using server = await run({
      configPath: "test/configs/onInitFuncs.ts",
    });

    const res = await callLambda(server.port, "fromInitialDefineConfig");

    expect(res).deep.eq({ ok: true, ORIGIN: "FROM_ONINIT_HOOK" });
  });
});
