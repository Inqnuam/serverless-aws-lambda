import { NoSuchTagSet, S3Error } from "../errors/s3Error";
import { S3LocalService } from "./localAction";
import type { IncomingHttpHeaders, ServerResponse } from "http";

export class GetBucketTaggingAction extends S3LocalService {
  bucket: string;
  constructor(url: URL, headers: IncomingHttpHeaders) {
    super(headers);

    const [bucket] = decodeURIComponent(url.pathname.replace("/%40s3/", "").replace("/@s3/", "")).split("/").filter(Boolean);
    this.bucket = bucket;
  }
  async exec(res: ServerResponse) {
    if (this.hasNot(this.bucket, res)) {
      return;
    }

    try {
      res.setHeader("x-amzn-requestid", this.requestId);

      const tags = S3LocalService.persistence.buckets[this.bucket].tags;
      if (!tags) {
        throw new NoSuchTagSet(this.requestId);
      }

      res.statusCode = 200;

      const body = {
        Tagging: {
          TagSet: {
            Tag: [],
          },
        },
      };

      for (const [Key, Value] of Object.entries(tags)) {
        // @ts-ignore
        body.Tagging.TagSet.Tag.push({ Key, Value });
      }
      const tagsAsXml = S3LocalService.XMLBuilder.build(body);

      res.setHeader("Content-Type", "application/xml");
      res.end(`<?xml version="1.0" encoding="UTF-8"?>${tagsAsXml}`);
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
