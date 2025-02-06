import { run } from "serverless-aws-lambda/standalone";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { S3 } from "@aws-sdk/client-s3";
import { randomInt } from "node:crypto";

let server: Awaited<ReturnType<typeof run>>;
let client: S3;
describe("S3 Plugin", () => {
  beforeAll(async () => {
    server = await run({
      configPath: "test/configs/slsConfig.ts",
    });

    client = new S3({
      endpoint: `http://127.0.0.1:${server.port}/@s3`,
      region: "eu-west-3",
      credentials: {
        accessKeyId: "test",
        secretAccessKey: "test",
      },
    });
  });

  afterAll(async () => {
    await server?.kill();
  });

  it("Should create Bucket", async () => {
    const bucketCreated = await client.createBucket({ Bucket: `dummy-create-bucket-name${randomInt(7000)}` });
    expect(bucketCreated.$metadata.httpStatusCode).toBe(200);
  });

  it("Should delete Bucket", async () => {
    const Bucket = `dummy-delete-bucket-${randomInt(7000)}`;
    const bucketCreated = await client.createBucket({ Bucket });
    expect(bucketCreated.$metadata.httpStatusCode).toBe(200);

    const deleteResponse = await client.deleteBucket({ Bucket });
    expect(deleteResponse.$metadata.httpStatusCode).toBe(204);

    const { Buckets } = await client.listBuckets();
    expect(Buckets?.find((x) => x.Name == Bucket)).toBeUndefined();
  });

  it("Should put Object", async () => {
    const Bucket = `dummy-put-object-${randomInt(7000)}`;
    const Key = "files/awsome.file";
    const Body = "This is an awsome file";
    await client.createBucket({ Bucket });

    await client.putObject({ Bucket, Key, Body, Tagging: "Key1=Value1" });

    const getObjRes = await client.getObject({ Bucket, Key });
    expect(await getObjRes.Body?.transformToString()).toBe(Body);

    const getObjTags = await client.getObjectTagging({ Bucket, Key });
    expect(getObjTags.TagSet).deep.eq([{ Key: "Key1", Value: "Value1" }]);
  });

  it("Should delete Object", async () => {
    const Bucket = `dummy-delete-object-${randomInt(7000)}`;
    const Key = "files/awsome.file";
    const Body = "This is an awsome file";
    await client.createBucket({ Bucket });

    await client.putObject({ Bucket, Key, Body, Tagging: "Key1=Value1" });

    const listRes = await client.listObjectsV2({ Bucket });
    expect(listRes.Contents).toHaveLength(1);

    const delRes = await client.deleteObject({ Bucket, Key });
    expect(delRes.$metadata.httpStatusCode).toBe(204);

    const listRes2 = await client.listObjectsV2({ Bucket });
    expect(listRes2.Contents).toBeUndefined();
  });

  it("Should delete Objects", async () => {
    const Bucket = `dummy-delete-objects-${randomInt(7000)}`;
    const Key = "files/awsome.file";
    const Body = "This is an awsome file";
    await client.createBucket({ Bucket });

    await client.putObject({ Bucket, Key, Body });
    await client.putObject({ Bucket, Key: Key + "2", Body });

    const listRes = await client.listObjectsV2({ Bucket });
    expect(listRes.Contents).toHaveLength(2);

    const delRes = await client.deleteObjects({ Bucket, Delete: { Objects: [{ Key }, { Key: Key + "2" }] } });
    expect(delRes.$metadata.httpStatusCode).toBe(200);

    const listRes2 = await client.listObjectsV2({ Bucket });
    expect(listRes2.Contents).toBeUndefined();
  });

  it("Should head Object", async () => {
    const Bucket = `dummy-head-object-${randomInt(7000)}`;
    const Key = "files/awsome.file";
    const Body = "This is an awsome file";
    await client.createBucket({ Bucket });

    await client.putObject({ Bucket, Key, Body, ContentType: "application/json", Metadata: { hello: "world" } });

    const headRes = await client.headObject({ Bucket, Key });

    expect(headRes.ETag).toBeDefined();
    expect(headRes.ContentType).toBe("application/json");
    expect(headRes.Metadata).deep.eq({ hello: "world" });
  });
});
