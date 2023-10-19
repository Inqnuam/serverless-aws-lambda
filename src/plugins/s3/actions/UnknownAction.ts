import { S3LocalService } from "./localAction";
import type { IncomingHttpHeaders, ServerResponse } from "http";

export class UnknownAction extends S3LocalService {
  constructor(url: URL, headers: IncomingHttpHeaders) {
    super(headers);
  }
  exec(res: ServerResponse) {
    res.statusCode = 500;
    res.setHeader("x-amzn-requestid", this.requestId);
    res.setHeader("Content-Type", "application/xml");
    res.setHeader("Server", "AmazonS3");
    res.end(
      `<Error><Code>UnknownOperation</Code><Message>Your request is currently not supported.</Message><RequestId>${this.requestId}</RequestId><HostId>local</HostId></Error>`
    );
  }
}
