import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "http";
import { S3LocalService, type LocalS3Object } from "./localAction";
import { noSuchKey } from "../errors/notFound";
import path from "path";
import { copyFile, readFile, stat } from "fs/promises";
import { calulcateETag } from "../calulcateETag";
import { triggerEvent } from "../triggerEvent";
import { checkS3Conditions } from "./GetObjectAction";

export class CopyObjectAction extends S3LocalService {
  bucket: string;
  key: string;
  sourceBucket: string;
  sourceKey: string;
  contentType: string;
  cacheControl?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  contentLanguage?: string;
  websiteRedirectLocation?: string;
  expires?: number;
  storageClass: LocalS3Object["StorageClass"] = "STANDARD";

  metadataDirective?: string;
  ifMatch?: string;
  ifNoneMatch?: string;
  ifModifiedSince?: number;
  ifUnmodifiedSince?: number;

  constructor(url: URL, headers: IncomingHttpHeaders) {
    super(headers);
    const [bucket, ...rest] = decodeURIComponent(url.pathname.replace("/%40s3/", "").replace("/@s3/", "")).split("/").filter(Boolean);

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

    this.metadataDirective = headers["x-amz-metadata-directive"] as string;

    const sourceCopy = (headers["x-amz-copy-source"] as string) ?? "";
    const [sourceBucket, ...sourceRest] = decodeURIComponent(sourceCopy.replace("/@s3/", "")).split("/").filter(Boolean);
    this.sourceBucket = sourceBucket;
    this.sourceKey = sourceRest.join("/");

    this.ifMatch = headers["x-amz-copy-source-if-match"] as string;
    this.ifNoneMatch = headers["x-amz-copy-source-if-none-match"] as string;

    if (headers["x-amz-copy-source-if-modified-since"]) {
      this.ifModifiedSince = new Date(headers["x-amz-copy-source-if-modified-since"] as string).getTime();
    }
    if (headers["x-amz-copy-source-if-unmodified-since"]) {
      this.ifUnmodifiedSince = new Date(headers["x-amz-copy-source-if-unmodified-since"] as string).getTime();
    }
  }
  async exec(res: ServerResponse, req: IncomingMessage) {
    if (this.sourceKey == "") {
      res.statusCode = 400;
      res.setHeader("x-amzn-requestid", this.requestId);
      res.setHeader("Content-Type", "application/xml");
      res.setHeader("Server", "AmazonS3");

      res.end(
        `<?xml version="1.0" encoding="UTF-8"?><Error><Code>InvalidArgument</Code><Message>Invalid copy source object key</Message><ArgumentName>x-amz-copy-source</ArgumentName><ArgumentValue>x-amz-copy-source</ArgumentValue><RequestId>${this.requestId}</RequestId><HostId>local</HostId></Error>`
      );
      return;
    }
    if (this.hasNot(this.bucket, res)) {
      return;
    }

    if (this.hasNot(this.sourceBucket, res)) {
      return;
    }

    if (!this.isValidStorageClass(this.storageClass, res)) {
      return;
    }

    if (!S3LocalService.persistence.buckets[this.sourceBucket].objects[this.sourceKey]) {
      res
        .writeHead(404, {
          "x-amzn-requestid": this.requestId,
          "Content-Type": "application/xml",
          Server: "AmazonS3",
        })
        .end(noSuchKey({ Key: this.sourceKey, RequestId: this.requestId }));
      return;
    }

    const sourceData = S3LocalService.persistence.buckets[this.sourceBucket].objects[this.sourceKey];

    if ([this.bucket, this.key].join("/") == [this.sourceBucket, this.sourceKey].join("/")) {
      const sameMetadata: boolean[] = [this.storageClass == sourceData.StorageClass, this.websiteRedirectLocation == sourceData.websiteRedirectLocation];

      // NOTE add encrypt comparison once they are supported
      // if (this.metadataDirective != "REPLACE") {
      //   sameMetadata.push();
      // }

      if (sameMetadata.every((x) => x === true)) {
        res.statusCode = 400;
        res.setHeader("x-amzn-requestid", this.requestId);
        res.setHeader("Content-Type", "application/xml");
        res.setHeader("Server", "AmazonS3");
        res.end(
          `<Error><Code>InvalidRequest</Code><Message>This copy request is illegal because it is trying to copy an object to itself without changing the object's metadata, storage class, website redirect location or encryption attributes.</Message><RequestId>${this.requestId}</RequestId><HostId>local</HostId></Error>`
        );

        return;
      }
    }

    const cond = { ifMatch: this.ifMatch, ifNoneMatch: this.ifNoneMatch, ifModifiedSince: this.ifModifiedSince, ifUnmodifiedSince: this.ifUnmodifiedSince };

    const status = checkS3Conditions(cond, sourceData);

    if (status !== 200) {
      res
        .writeHead(status.statusCode, {
          "x-amzn-requestid": this.requestId,
          "Content-Type": "application/xml",
          Server: "AmazonS3",
        })
        .end(
          `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${status.Code}</Code><Message>At least one of the pre-conditions you specified did not hold</Message><Condition>${status.Condition}</Condition><RequestId>${this.requestId}</RequestId><HostId>local</HostId></Error>`
        );

      return;
    }

    const sourcePath = path.join(S3LocalService.localStoragePath, this.sourceBucket, sourceData.currentKey);
    const currentKey = S3LocalService.genLocalKey(this.bucket, this.key);
    const destinationPath = path.join(S3LocalService.localStoragePath, this.bucket, currentKey);

    try {
      await copyFile(sourcePath, destinationPath);

      const fileStat = await stat(destinationPath);
      const ETag = calulcateETag(await readFile(destinationPath));

      if (this.metadataDirective == "COPY") {
        S3LocalService.persistence.buckets[this.bucket].objects[this.key] = {
          currentKey,
          type: sourceData.type,
          cacheControl: sourceData.cacheControl,
          contentDisposition: sourceData.contentDisposition,
          contentEncoding: sourceData.contentEncoding,
          contentLanguage: sourceData.contentLanguage,
          expires: sourceData.expires,
          ETag,
          StorageClass: sourceData.StorageClass,
          LastModified: fileStat.mtimeMs,
          size: fileStat.size,
          metadata: sourceData.metadata,
          versions: {
            [currentKey]: {},
          },
        };
      } else {
        S3LocalService.persistence.buckets[this.bucket].objects[this.key] = {
          currentKey,
          type: this.contentType,
          cacheControl: this.cacheControl,
          contentDisposition: this.contentDisposition,
          contentEncoding: this.contentEncoding,
          contentLanguage: this.contentLanguage,
          expires: this.expires,
          ETag,
          StorageClass: this.storageClass,
          LastModified: fileStat.mtimeMs,
          size: fileStat.size,
          metadata: this.metadata,
          websiteRedirectLocation: this.websiteRedirectLocation,
          versions: {
            [currentKey]: {},
          },
        };
      }

      const LastModified = new Date(fileStat.mtimeMs).toISOString();
      res.statusCode = 200;
      res.setHeader("x-amzn-requestid", this.requestId);
      res.setHeader("Content-Type", "application/xml");
      res.setHeader("Server", "AmazonS3");

      res.end(`<?xml version="1.0" encoding="UTF-8"?>
<CopyObjectResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><LastModified>${LastModified}</LastModified><ETag>${ETag}</ETag></CopyObjectResult>`);

      const sourceIPAddress = req.socket.remoteAddress?.split(":")?.[3] ?? "127.0.0.1";
      await triggerEvent(S3LocalService.callableLambdas, {
        bucket: this.bucket,
        key: this.key,
        requestId: this.requestId,
        requestCmd: "CopyObject",
        eTag: ETag,
        sourceIPAddress,
        size: fileStat.size,
      });
    } catch (error) {
      console.error(error);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  }
}
