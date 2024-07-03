import { randomUUID } from "crypto";
import { readFile, stat, mkdir, rm } from "fs/promises";
import { writeFileSync, rmSync } from "fs";
import path from "path";
import { noSuchBucket } from "../errors/notFound";
import { triggerEvent } from "../triggerEvent";
import type { ServerResponse, IncomingHttpHeaders } from "http";
import type { ILambda } from "../../../defineConfig";
import { calulcateETag } from "../calulcateETag";
import { md5 } from "../commons/utils";

export interface BucketConfig {
  deletionPolicy: "Delete" | "Retain" | "RetainExceptOnCreate";
  versioning?: "Enabled" | "Suspended";
}

const StorageClass = ["STANDARD", "REDUCED_REDUNDANCY", "STANDARD_IA", "ONEZONE_IA", "INTELLIGENT_TIERING", "GLACIER", "DEEP_ARCHIVE", "OUTPOSTS", "GLACIER_IR", "SNOW"] as const;

export type LocalS3Object = {
  currentKey: string;
  type?: string;
  cacheControl?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  contentLanguage?: string;
  expires?: number;
  websiteRedirectLocation?: string;
  StorageClass: (typeof StorageClass)[number];
  ETag: string;
  LastModified: number;
  size: number;
  metadata: Record<string, any>;
  versions: Record<string, any>;
};

interface LocalS3PersistenceV1 {
  version: number;
  files: {
    [name: string]: LocalS3Object;
  };
}

interface LocalS3PersistenceV2 {
  version: number;
  buckets: {
    [name: string]: {
      date: number;

      objects: {
        [key: string]: LocalS3Object;
      };
    } & BucketConfig;
  };
}

const periodsPattern = /\.{2,}/;
const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
const bucketPattern = /^[a-z0-9]+[a-z0-9.-]+[a-z0-9]$/;

export abstract class S3LocalService {
  abstract exec(res: ServerResponse, ...rest: any): Promise<void> | void;
  static localStoragePath: string;
  static persist: boolean = true;
  static persistence: LocalS3PersistenceV2 = { version: 2, buckets: {} };
  static genLocalKey(bucket: string, key: string, version?: string) {
    return md5(path.posix.join(bucket, key, version ?? ""));
  }
  static #convertV1toV2 = async (v1: LocalS3PersistenceV1): Promise<LocalS3PersistenceV2> => {
    const v2: LocalS3PersistenceV2 = { version: 2, buckets: {} };

    for (const [fullPath, oldMetadata] of Object.entries(v1.files)) {
      try {
        const [bucket, ...key] = fullPath.replace(this.localStoragePath, "").split("/").filter(Boolean);
        const f = await stat(fullPath);
        const keyPath = key.join("/");

        const currentKey = this.genLocalKey(bucket, keyPath);
        const metadata: LocalS3Object = {
          currentKey,
          type: oldMetadata.type,
          cacheControl: oldMetadata.cacheControl,
          StorageClass: "STANDARD",
          size: f.size,
          LastModified: f.mtimeMs,
          ETag: calulcateETag(await readFile(fullPath)),
          metadata: {},
          versions: {
            [currentKey]: {},
          },
        };

        if (v2.buckets[bucket]) {
          v2.buckets[bucket].objects[keyPath] = metadata;
        } else {
          v2.buckets[bucket] = { date: Date.now(), deletionPolicy: "Retain", objects: { [keyPath]: metadata } };
        }
      } catch (error) {}
    }

    return v2;
  };
  static async bootstrap() {
    try {
      const persistence = await readFile(path.join(this.localStoragePath, "__items.json"), "utf-8");

      const p = JSON.parse(persistence);

      if (p.version == 2) {
        this.persistence = p;
        return;
      }

      this.persistence = await this.#convertV1toV2(p);
    } catch (error) {}
  }
  static async createBucketDir(bucketName: string, config: BucketConfig) {
    const dirPath = path.join(this.localStoragePath, bucketName);
    try {
      const f = await stat(dirPath);
      if (!f.isDirectory()) {
        await rm(dirPath);
        throw new Error();
      }
    } catch (error) {
      try {
        await mkdir(dirPath, { recursive: true });
        this.persistence.buckets[bucketName] = { date: Date.now(), ...config, objects: {} };
      } catch (error) {
        console.error(error);
      }
    }
  }
  static saveState() {
    if (S3LocalService.persist) {
      writeFileSync(path.join(this.localStoragePath, "__items.json"), JSON.stringify(this.persistence));
    } else {
      rmSync(this.localStoragePath, { force: true, recursive: true });
    }
  }
  // https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html
  static isValidBucketName(bucket: string) {
    const l = bucket.length;

    if (
      l < 3 ||
      l > 63 ||
      periodsPattern.test(bucket) ||
      ipPattern.test(bucket) ||
      bucket.startsWith("xn--") ||
      bucket.startsWith("sthree-") ||
      bucket.endsWith("-s3alias") ||
      bucket.endsWith("--ol-s3")
    ) {
      return false;
    }

    return bucketPattern.test(bucket);
  }

  isValidStorageClass(storage: any, res: ServerResponse) {
    if (StorageClass.includes(storage)) {
      return true;
    }
    res
      .writeHead(400, {
        "x-amzn-requestid": this.requestId,
        "Content-Type": "application/xml",
        Server: "AmazonS3",
      })
      .end(
        `<Error><Code>InvalidStorageClass</Code><Message>The storage class you specified is not valid</Message><StorageClassRequested>${storage}</StorageClassRequested><RequestId>${this.requestId}</RequestId><HostId>local</HostId></Error>`
      );
    return false;
  }
  static callableLambdas: ILambda[] = [];
  requestId: string;
  metadata: Record<string, any> = {};
  constructor(headers: IncomingHttpHeaders) {
    this.requestId = (headers["amz-sdk-invocation-id"] as string) ?? randomUUID();

    const metaKeys = Object.keys(headers).filter((x) => x.startsWith("x-amz-meta-"));

    metaKeys.forEach((x) => (this.metadata[x] = headers[x]));
  }

  hasNot(bucket: string, res: ServerResponse) {
    if (!S3LocalService.isValidBucketName(bucket)) {
      res.writeHead(400, {
        "x-amzn-requestid": this.requestId,
        "Content-Type": "application/xml",
        Server: "AmazonS3",
      }).end(`<?xml version="1.0" encoding="UTF-8"?>
      <Error><Code>InvalidBucketName</Code><Message>The specified bucket is not valid.</Message><BucketName>${bucket}</BucketName><RequestId>${this.requestId}</RequestId><HostId>local</HostId></Error>`);
      return;
    }

    if (!S3LocalService.persistence.buckets[bucket]) {
      res
        .writeHead(404, {
          "x-amzn-requestid": this.requestId,
          "Content-Type": "application/xml",
          Server: "AmazonS3",
        })

        .end(noSuchBucket({ Bucket: bucket, RequestId: this.requestId }));
      return true;
    }
  }
  static async removeObject(bucket: string, key: string, sourceIPAddress: string, requestId: string) {
    const data = this.persistence.buckets[bucket].objects[key];
    if (!data) {
      return;
    }
    const filePath = path.join(this.localStoragePath, bucket, data.currentKey);
    try {
      const fileStat = await stat(filePath);
      if (fileStat.isFile()) {
        await rm(filePath);
      }

      await triggerEvent(this.callableLambdas, {
        bucket,
        key,
        requestId,
        requestCmd: "DeleteObject",
        eTag: data.ETag,
        sourceIPAddress,
        size: fileStat.size,
      });
      delete this.persistence.buckets[bucket].objects[key];
    } catch (error) {}
  }
}
