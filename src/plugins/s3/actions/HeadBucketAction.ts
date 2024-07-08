import { S3LocalService } from "./localAction";
import type { IncomingHttpHeaders, ServerResponse } from "http";

export class HeadBucketAction extends S3LocalService {
  bucket: string;
  constructor(url: URL, headers: IncomingHttpHeaders) {
    super(headers);
    const [bucket] = decodeURIComponent(url.pathname.replace("/%40s3/", "").replace("/@s3/", "")).split("/").filter(Boolean);
    this.bucket = bucket;
  }
  exec(res: ServerResponse) {
    if (this.hasNot(this.bucket, res)) {
      return;
    }

    res.statusCode = 200;
    res.setHeader("x-amzn-requestid", this.requestId);
    res.end();
  }
}
