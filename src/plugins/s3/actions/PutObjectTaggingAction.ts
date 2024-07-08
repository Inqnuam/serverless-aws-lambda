import { noSuchKey } from "../errors/notFound";
import { S3Error } from "../errors/s3Error";
import { S3LocalService } from "./localAction";
import type { IncomingHttpHeaders, ServerResponse, IncomingMessage } from "http";

export class PutObjectTaggingAction extends S3LocalService {
  bucket: string;
  key: string;
  constructor(url: URL, headers: IncomingHttpHeaders) {
    super(headers);
    const [bucket, ...rest] = decodeURIComponent(url.pathname.replace("/%40s3/", "").replace("/@s3/", "")).split("/").filter(Boolean);
    this.bucket = bucket;
    this.key = rest.join("/");
  }
  async exec(res: ServerResponse, req: IncomingMessage) {
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
      res.setHeader("x-amzn-requestid", this.requestId);
      S3LocalService.persistence.buckets[this.bucket].objects[this.key].tags = await S3LocalService.getTagsFromRequest(req, this.requestId, "Object");

      res.statusCode = 200;
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
