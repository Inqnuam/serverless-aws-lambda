import { S3LocalService } from "./localAction";
import type { IncomingHttpHeaders, ServerResponse } from "http";

export class CreateBucketAction extends S3LocalService {
  bucket: string;
  constructor(url: URL, headers: IncomingHttpHeaders) {
    super(headers);
    const [bucket] = decodeURIComponent(url.pathname.replace("/%40s3/", "").replace("/@s3/", "")).split("/").filter(Boolean);
    this.bucket = bucket;
  }
  async exec(res: ServerResponse) {
    if (!S3LocalService.isValidBucketName(this.bucket)) {
      res.writeHead(400, {
        "x-amzn-requestid": this.requestId,
        "Content-Type": "application/xml",
        Server: "AmazonS3",
      }).end(`<?xml version="1.0" encoding="UTF-8"?>
  <Error><Code>InvalidBucketName</Code><Message>The specified bucket is not valid.</Message><BucketName>${this.bucket}</BucketName><RequestId>${this.requestId}</RequestId><HostId>local</HostId></Error>`);
      return;
    }

    if (S3LocalService.persistence.buckets[this.bucket]) {
      res.statusCode = 409;
      res.setHeader("Content-Type", "application/xml");
      res.setHeader("x-amzn-requestid", this.requestId);
      res.setHeader("Server", "AmazonS3");
      res.end(`<?xml version="1.0" encoding="UTF-8"?>
        <Error><Code>BucketAlreadyOwnedByYou</Code><Message>Your previous request to create the named bucket succeeded and you already own it.</Message><BucketName>${this.bucket}</BucketName><RequestId>${this.requestId}</RequestId><HostId>local</HostId></Error>`);

      return;
    }

    await S3LocalService.createBucketDir(this.bucket, { deletionPolicy: "Retain" });

    res.statusCode = 200;
    res.setHeader("x-amzn-requestid", this.requestId);
    res.setHeader("Location", `/${this.bucket}`);
    res.setHeader("Server", "AmazonS3");
    res.end();
  }
}
