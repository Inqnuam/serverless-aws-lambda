import { S3LocalService } from "./localAction";
import { createReadStream } from "fs";
import path from "path";

import type { IncomingHttpHeaders, ServerResponse } from "http";
import type { LocalS3Object } from "./localAction";

import { noSuchKey } from "../errors/notFound";

export const checkS3Conditions = (
  { ifMatch, ifNoneMatch, ifModifiedSince, ifUnmodifiedSince }: { ifMatch?: string; ifNoneMatch?: string; ifModifiedSince?: number; ifUnmodifiedSince?: number },
  { ETag, LastModified }: LocalS3Object
) => {
  if (ifMatch && ifMatch !== ETag) {
    // TODO additional checks
    return {
      statusCode: 412,
      Code: "PreconditionFailed",
      Condition: "If-Match",
    };
  }

  if (ifNoneMatch && ifNoneMatch === ETag) {
    return {
      statusCode: 304,
      Code: "PreconditionFailed",
      Condition: "If-None-Match",
    };
  }

  if (ifModifiedSince && ifModifiedSince >= LastModified) {
    return {
      statusCode: 304,
      Code: "PreconditionFailed",
      Condition: "If-Modified-Since",
    };
  }

  if (ifUnmodifiedSince && ifUnmodifiedSince < LastModified) {
    return {
      statusCode: 412,
      Code: "PreconditionFailed",
      Condition: "If-Unmodified-Since",
    };
  }

  return 200;
};

export class GetObjectAction extends S3LocalService {
  bucketPath: string;
  bucket: string;
  key: string;
  versionId: string | null;
  partNumber: number | null;
  range?: [number, number];
  ifMatch?: string;
  ifNoneMatch?: string;
  ifModifiedSince?: number;
  ifUnmodifiedSince?: number;
  constructor(url: URL, headers: IncomingHttpHeaders) {
    super(headers);

    const filePath = decodeURIComponent(url.pathname.replace("/%40s3/", "").replace("/@s3/", ""));
    const [bucket, ...key] = filePath.split("/").filter(Boolean);

    this.bucket = bucket;
    this.key = key.join("/");
    this.bucketPath = path.join(GetObjectAction.localStoragePath, bucket);

    // NOTE not implemented yet
    this.versionId = url.searchParams.get("versionId");
    this.partNumber = url.searchParams.has("partNumber") ? Number(url.searchParams.get("partNumber")) : null;

    if (headers["range"]) {
      const [rangeString] = (headers["range"] as string).split("bytes=").filter(Boolean);

      const [start, end] = rangeString.split("-");

      if (!isNaN(Number(start)) && !isNaN(Number(end))) {
        this.range = [Number(start), Number(end)];
      }
    }

    this.ifMatch = headers["if-match"] as string;
    this.ifNoneMatch = headers["if-none-match"] as string;

    if (headers["if-modified-since"]) {
      this.ifModifiedSince = new Date(headers["if-modified-since"]).getTime();
    }
    if (headers["if-unmodified-since"]) {
      this.ifUnmodifiedSince = new Date(headers["if-unmodified-since"]).getTime();
    }
  }

  async exec(res: ServerResponse) {
    if (this.hasNot(this.bucket, res)) {
      return;
    }

    if (!S3LocalService.persistence.buckets[this.bucket].objects[this.key]) {
      res
        .writeHead(404, {
          "x-amzn-requestid": this.requestId,
          "Content-Type": "application/xml",
          Server: "AmazonS3",
        })
        .end(noSuchKey({ Key: this.key, RequestId: this.requestId }));
      return;
    }

    try {
      const cond = { ifMatch: this.ifMatch, ifModifiedSince: this.ifModifiedSince, ifNoneMatch: this.ifNoneMatch, ifUnmodifiedSince: this.ifUnmodifiedSince };
      const data = S3LocalService.persistence.buckets[this.bucket].objects[this.key];
      const status = checkS3Conditions(cond, data);

      if (status == 200) {
        let code = 200;
        let contentLength = data.size;
        let contentRange: string | undefined = undefined;
        let contentType = data.type;
        const readOpt: { start?: number; end?: number } = {};

        if (this.range) {
          code = 206;
          readOpt.start = this.range[0];
          readOpt.end = this.range[1];

          let offset = 1;
          if (readOpt.end > data.size) {
            readOpt.end = data.size;
            offset--;
          }
          contentLength = offset + readOpt.end - readOpt.start;

          contentRange = `bytes ${readOpt.start}-${readOpt.end}/${data.size}`;
          contentType = "application/octet-stream";
        }

        res.statusCode = code;
        res.setHeader("x-amzn-requestid", this.requestId);
        res.setHeader("x-amz-server-side-encryption", "AES256");
        res.setHeader("Date", new Date().toUTCString());
        res.setHeader("Last-Modified", new Date(data.LastModified).toUTCString());
        res.setHeader("ETag", data.ETag);
        res.setHeader("Accept-Ranges", "bytes");

        if (contentRange) {
          res.setHeader("Content-Range", contentRange);
        }

        res.setHeader("Content-Length", contentLength);
        if (contentType) {
          res.setHeader("Content-Type", contentType);
        }

        res.setHeader("Server", "AmazonS3");

        if (data.cacheControl) {
          res.setHeader("Cache-Control", data.cacheControl);
        }

        if (data.contentDisposition) {
          res.setHeader("Content-Disposition", data.contentDisposition);
        }

        if (data.contentEncoding) {
          res.setHeader("Content-Encoding", data.contentEncoding);
        }

        if (data.contentLanguage) {
          res.setHeader("Content-Language", data.contentLanguage);
        }
        if (data.expires) {
          res.setHeader("Expires", new Date(data.expires).toUTCString());
        }

        if (data.websiteRedirectLocation) {
          res.setHeader("x-amz-website-redirect-location", data.websiteRedirectLocation);
        }

        Object.entries(data.metadata).forEach(([key, value]) => {
          res.setHeader(key, value);
        });

        createReadStream(path.join(this.bucketPath, data.currentKey), readOpt).pipe(res);
      } else {
        res
          .writeHead(status.statusCode, {
            "x-amzn-requestid": this.requestId,
            "Content-Type": "application/xml",
            Server: "AmazonS3",
          })
          .end(
            `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${status.Code}</Code><Message>At least one of the pre-conditions you specified did not hold</Message><Condition>${status.Condition}</Condition><RequestId>${this.requestId}</RequestId><HostId>local</HostId></Error>`
          );
      }
    } catch (error) {
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  }
}
