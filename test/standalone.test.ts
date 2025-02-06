import { run } from "serverless-aws-lambda/standalone";
import { describe, it, expect } from "vitest";
import { S3Client, CreateBucketCommand } from "@aws-sdk/client-s3";
import { LambdaClient, InvokeCommand, InvokeWithResponseStreamCommand } from "@aws-sdk/client-lambda";
import { randomInt } from "node:crypto";

async function callLambda(port: number, lambdaName: string, payload?: string) {
  const res = await fetch(`http://localhost:${port}/@invoke/${lambdaName}`, {
    method: "POST",
    body: payload,
  });

  return res.json();
}

const codec = new TextDecoder("utf-8");

describe("Standalone", () => {
  it("Should run new server with Node", async () => {
    await using server = await run({
      functions: [{ name: "visitor", handler: "test/lambdas/visitor.handler", environment: { HELLO: "WORLD" } }],
    });

    // first call
    await callLambda(server.port, "visitor");

    // second call
    const res = await callLambda(server.port, "visitor", JSON.stringify({ someField: "someValue" }));

    expect(res).deep.eq({
      count: 2,
      HELLO: "WORLD",
      payload: {
        someField: "someValue",
      },
    });
  });

  it("Should load defineConfig from file", async () => {
    await using server = await run({
      configPath: "test/slsConfig.ts",
    });

    const client = new S3Client({
      endpoint: `http://127.0.0.1:${server.port}/@s3`,
      region: "eu-west-3",
      credentials: {
        accessKeyId: "test",
        secretAccessKey: "test",
      },
    });

    const bucketCreated = await client.send(new CreateBucketCommand({ Bucket: `dummy-bucket-${randomInt(9000)}` }));
    expect(bucketCreated.$metadata.httpStatusCode).toBe(200);
  });

  it("Should work with aws-sdk Lambda client", async () => {
    await using server = await run({
      functions: [{ name: "visitor", handler: "test/lambdas/visitor.handler" }],
    });

    const client = new LambdaClient({
      endpoint: server.url,
      region: "eu-west-3",
      credentials: {
        accessKeyId: "test",
        secretAccessKey: "test",
      },
    });

    const invoke = await client.send(
      new InvokeCommand({
        FunctionName: "visitor",
        ClientContext: Buffer.from(JSON.stringify({ customContext: "dummy value" })).toString("base64"),
        Payload: JSON.stringify({ test: "this is a payload" }),
      })
    );

    const response = JSON.parse(codec.decode(invoke.Payload));

    expect(response).deep.eq({
      count: 1,
      payload: { test: "this is a payload" },
      clientContext: { customContext: "dummy value" },
    });
  });

  it("Should work with streamed responses", async () => {
    await using server = await run({
      functions: [{ name: "videoHandler", handler: "test/lambdas/videoHandler.handler" }],
    });

    const client = new LambdaClient({
      endpoint: server.url,
      region: "eu-west-3",
      credentials: {
        accessKeyId: "test",
        secretAccessKey: "test",
      },
    });

    const bufferedInvoke = await client.send(
      new InvokeCommand({
        FunctionName: "videoHandler",
      })
    );

    const bufferedResponse = JSON.parse(codec.decode(bufferedInvoke.Payload));

    expect(bufferedResponse).toBe(123);

    const streamInvoke = await client.send(
      new InvokeWithResponseStreamCommand({
        FunctionName: "videoHandler",
        Payload: JSON.stringify({ streamThisValue: "some dummy thing" }),
      })
    );

    let collectedChunks = [];
    for await (const x of streamInvoke.EventStream!) {
      if (x.PayloadChunk) {
        // @ts-ignore
        collectedChunks = collectedChunks.concat(Array.from(x.PayloadChunk.Payload!.values()));
      }
    }

    const streamedFullResponse = codec.decode(new Uint8Array(collectedChunks));

    expect(streamedFullResponse).toBe("123some dummy thing");
  });

  it("Should work with FunctionUrl streamed responses", async () => {
    await using server = await run({
      functions: [{ name: "funcUrl", handler: "test/lambdas/funcUrl.handler", url: { invokeMode: "RESPONSE_STREAM" } }],
    });

    const fetchRes = await fetch(`${server.url}/@url/funcUrl`);

    expect(fetchRes.status).toBe(201);

    expect(fetchRes.headers.get("content-type")).toBe("application/json");

    const res = await fetchRes.json();

    expect(res).deep.eq({ hello: "awsome world" });
  });

  it("Should work with http event", async () => {
    await using server = await run({
      functions: [{ name: "users", handler: "test/lambdas/users.handler", events: [{ http: "POST /users" }, { http: { method: "GET", path: "/users" } }] }],
    });

    expect((await fetch(`${server.url}/users`, { method: "PUT" })).status).toBe(404);

    const firstGet = await (await fetch(`${server.url}/users`)).json();

    expect(firstGet).deep.eq({});

    await fetch(`${server.url}/users`, { method: "POST", body: JSON.stringify({ firstname: "John!" }) });
    const secondGet = await (await fetch(`${server.url}/users`)).json();

    expect(secondGet).deep.eq({
      createdUser: {
        firstname: "John!",
      },
    });
  });

  it("Should run new server with Python", { timeout: 18_000 }, async () => {
    await using server = await run({
      functions: [{ name: "pipi", handler: "test/lambdas/pipi.handler", runtime: "python3.7", timeout: 16, environment: { HELLO: "WORLD" } }],
    });

    // first call
    await callLambda(server.port, "pipi");
    // second call
    const res = await callLambda(server.port, "pipi");
    expect(res).deep.eq({ statusCode: 200, body: '"Hello from Lambda! counter:2"' });

    const finalResult = await callLambda(server.port, "pipi");

    expect(finalResult.errorType).toBe("Exception");
    expect(finalResult.errorMessage).toBe("Sorry, can not visit more than 2 times.");
  });
});
