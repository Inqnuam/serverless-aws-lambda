import { UnsupportedCommand } from "../errors/s3Error";
import { S3LocalService } from "./localAction";
import type { IncomingHttpHeaders, ServerResponse, IncomingMessage } from "http";

export class PutBucketPolicyAction extends S3LocalService {
  bucket: string;
  constructor(url: URL, headers: IncomingHttpHeaders) {
    super(headers);
    const [bucket] = decodeURIComponent(url.pathname.replace("/%40s3/", "").replace("/@s3/", "")).split("/").filter(Boolean);
    this.bucket = bucket;
  }
  async exec(res: ServerResponse, req: IncomingMessage) {
    if (this.hasNot(this.bucket, res)) {
      return;
    }
    // TODO implement

    res.statusCode = 500;
    res.setHeader("x-amzn-requestid", this.requestId);
    res.setHeader("Content-Type", "application/xml");
    res.end(new UnsupportedCommand("PutBucketPolicy", this.requestId).toXml());
  }
}
