import { S3LocalService, type LocalS3Object } from "./localAction";

import type { IncomingHttpHeaders, ServerResponse, IncomingMessage } from "http";
import { createWriteStream } from "fs";
import path from "path";
import { mkdir, readFile, stat } from "fs/promises";
import { triggerEvent } from "../triggerEvent";
import { calulcateETag } from "../calulcateETag";

export class PutObjectAction extends S3LocalService {
  bucket: string;
  key: string;
  contentType: string;
  cacheControl?: string;

  contentDisposition?: string;
  contentEncoding?: string;
  contentLanguage?: string;
  websiteRedirectLocation?: string;
  expires?: number;
  storageClass: LocalS3Object["StorageClass"] = "STANDARD";
  constructor(url: URL, headers: IncomingHttpHeaders) {
    super(headers);
    const [bucket, ...rest] = decodeURIComponent(url.pathname.replace("/@s3/", "")).split("/").filter(Boolean);

    this.bucket = bucket;
    this.key = rest.join("/");

    this.contentType = (headers["content-type"] as string) ?? "application/octet-stream";
    this.cacheControl = headers["cache-control"];

    this.contentDisposition = headers["content-disposition"];
    this.contentEncoding = headers["content-encoding"];
    this.contentLanguage = headers["content-language"];
    this.websiteRedirectLocation = headers["x-amz-website-redirect-location"] as string;

    const storageClass = headers["x-amz-storage-class"] as LocalS3Object["StorageClass"];
    if (storageClass) {
      this.storageClass = storageClass;
    }
    const expires = new Date(headers["expires"] as string);

    if (!isNaN(expires as unknown as number)) {
      this.expires = expires.getTime();
    }
  }
  async exec(res: ServerResponse, req: IncomingMessage) {
    if (this.hasNot(this.bucket, res)) {
      return;
    }
    if (!this.isValidStorageClass(this.storageClass, res)) {
      return;
    }

    const currentKey = S3LocalService.genLocalKey(this.bucket, this.key);
    const filePath = path.join(S3LocalService.localStoragePath, this.bucket, currentKey);
    try {
      await mkdir(path.dirname(filePath), { recursive: true });
    } catch (error) {}
    const savingFile = createWriteStream(filePath);

    savingFile.on("close", async () => {
      res.end();

      try {
        const fileStat = await stat(filePath);
        const ETag = calulcateETag(await readFile(filePath));

        S3LocalService.persistence.buckets[this.bucket].objects[this.key] = {
          currentKey,
          type: this.contentType,
          cacheControl: this.cacheControl,
          contentDisposition: this.contentDisposition,
          contentEncoding: this.contentEncoding,
          contentLanguage: this.contentLanguage,
          expires: this.expires,
          websiteRedirectLocation: this.websiteRedirectLocation,
          ETag,
          size: fileStat.size,
          LastModified: fileStat.mtimeMs,
          StorageClass: this.storageClass,
          metadata: this.metadata,
          versions: {
            [currentKey]: {},
          },
        };
        const sourceIPAddress = req.socket.remoteAddress?.split(":")?.[3] ?? "127.0.0.1";

        await triggerEvent(S3LocalService.callableLambdas, {
          bucket: this.bucket,
          key: this.key,
          requestId: this.requestId,
          requestCmd: "PutObject",
          eTag: ETag,
          sourceIPAddress,
          size: fileStat.size,
        });
      } catch (error) {
        console.log(error);
      }
    });

    res.setHeader("status", 100);
    res.setHeader("Server", "AmazonS3");
    res.setHeader("x-amzn-requestid", this.requestId);

    req.pipe(savingFile);
  }
}
