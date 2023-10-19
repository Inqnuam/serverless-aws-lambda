import { S3LocalService } from "./localAction";
import type { IncomingHttpHeaders, ServerResponse } from "http";

export class ListBucketsAction extends S3LocalService {
  constructor(url: URL, headers: IncomingHttpHeaders) {
    super(headers);
  }
  async exec(res: ServerResponse) {
    const buckets: { name: string; date: string }[] = [];

    Object.entries(S3LocalService.persistence.buckets).forEach(([bucket, data]) => {
      buckets.push({ name: bucket, date: new Date(data.date).toISOString() });
    });

    res.writeHead(200, {
      "x-amz-request-id": this.requestId,
      "Content-Type": "application/xml",
      "transfer-encoding": "chunked",
      Server: "AmazonS3",
    });
    res.end(`<?xml version="1.0" encoding="UTF-8"?>
    <ListAllMyBucketsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
      <Owner>
        <DisplayName>local-User</DisplayName>
        <ID>1234567890123456789</ID>
      </Owner>
      <Buckets>
          ${buckets
            .map(
              (x) => `<Bucket>
          <CreationDate>${x.date}</CreationDate>
          <Name>${x.name}</Name>
      </Bucket>`
            )
            .join("\n")}
       </Buckets>
    </ListAllMyBucketsResult>`);
  }
}
