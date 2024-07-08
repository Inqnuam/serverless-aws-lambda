import { S3LocalService } from "./localAction";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "http";

export class DeleteObjectAction extends S3LocalService {
  bucket: string;
  key: string;
  version: string | null;
  constructor(url: URL, headers: IncomingHttpHeaders) {
    super(headers);

    const filePath = decodeURIComponent(url.pathname.replace("/%40s3/", "").replace("/@s3/", ""));
    const [bucket, ...rest] = filePath.split("/").filter(Boolean);

    this.bucket = bucket;
    this.key = rest.join("/");
    this.version = url.searchParams.get("versionId");
  }
  async exec(res: ServerResponse, req: IncomingMessage) {
    if (this.hasNot(this.bucket, res)) {
      return;
    }

    res.statusCode = 204;
    res.setHeader("x-amzn-requestid", this.requestId);
    res.setHeader("Server", "AmazonS3");
    res.end();

    const sourceIPAddress = req.socket.remoteAddress?.split(":")?.[3] ?? "127.0.0.1";
    await S3LocalService.removeObject(this.bucket, this.key, sourceIPAddress, this.requestId);
  }
}
