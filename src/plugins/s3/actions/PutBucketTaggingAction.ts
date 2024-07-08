import { S3Error } from "../errors/s3Error";
import { S3LocalService } from "./localAction";
import type { IncomingHttpHeaders, ServerResponse, IncomingMessage } from "http";

export class PutBucketTaggingAction extends S3LocalService {
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

    try {
      res.setHeader("x-amzn-requestid", this.requestId);
      S3LocalService.persistence.buckets[this.bucket].tags = await S3LocalService.getTagsFromRequest(req, this.requestId, "Bucket");
      res.statusCode = 204;
      res.end();
    } catch (error) {
      res.statusCode = 400;

      if (error instanceof S3Error) {
        res.setHeader("Content-Type", "application/xml");
        if (error.statusCode) {
          res.statusCode = error.statusCode;
        }
        res.end(error.toXml());
        return;
      }

      if (error instanceof Error) {
        res.setHeader("Content-Type", "application/xml");
        res.end(S3Error.genericError({ Code: "UnknownError", Message: error.message, RequestId: this.requestId }));
        return;
      }

      res.end((error as any)?.toString?.());
    }
  }
}
