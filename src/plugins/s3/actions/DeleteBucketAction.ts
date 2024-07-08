import { S3LocalService } from "./localAction";
import { rm } from "fs/promises";
import path from "path";
import type { IncomingHttpHeaders, ServerResponse } from "http";

export class DeleteBucketAction extends S3LocalService {
  bucket: string;
  constructor(url: URL, headers: IncomingHttpHeaders) {
    super(headers);
    const filePath = decodeURIComponent(url.pathname.replace("/%40s3/", "").replace("/@s3/", ""));
    const [bucket] = filePath.split("/").filter(Boolean);

    this.bucket = bucket;
  }
  async exec(res: ServerResponse, ...rest: any) {
    if (this.hasNot(this.bucket, res)) {
      return;
    }

    try {
      const hasKeys = Object.keys(S3LocalService.persistence.buckets[this.bucket].objects).length > 0;
      const recursive = hasKeys && S3LocalService.persistence.buckets[this.bucket].deletionPolicy == "Retain" ? false : true;
      await rm(path.join(S3LocalService.localStoragePath, this.bucket), { recursive, force: true });
      delete S3LocalService.persistence.buckets[this.bucket];

      res
        .writeHead(204, {
          "x-amzn-requestid": this.requestId,
          Server: "AmazonS3",
        })
        .end();
    } catch (error) {
      res.writeHead(404, {
        "x-amzn-requestid": this.requestId,
        "Content-Type": "application/xml",
        Server: "AmazonS3",
      }).end(`<?xml version="1.0" encoding="UTF-8"?>
        <Error><Code>BucketNotEmpty</Code><Message>The bucket you tried to delete is not empty</Message><BucketName>${this.bucket}</BucketName><RequestId>${this.requestId}</RequestId><HostId>local</HostId></Error>`);
    }
  }
}
