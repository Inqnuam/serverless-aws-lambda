import { S3LocalService } from "./localAction";
import { collectBody } from "../../lambda/utils";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "http";

const parseBody = (body: string) => {
  const Objects: { Key: string; VersionId?: string }[] = [];

  // NOTE: currently Quiet mode is not supported as we dont support acl and ownership
  let Quiet: boolean | undefined = undefined;
  try {
    body.split("<Object>").forEach((o) => {
      const keyStartIx = o.indexOf("<Key>");
      if (keyStartIx == -1) {
        return;
      }

      const keyEndIx = o.indexOf("</Key>");
      const Key = o.slice(keyStartIx + 5, keyEndIx);

      const obj: (typeof Objects)[number] = { Key };

      const versionStartIx = o.indexOf("<VersionId>");

      if (versionStartIx > -1) {
        const versionEndIx = o.indexOf("</VersionId>");

        const VersionId = o.slice(versionStartIx + 11, versionEndIx);
        obj.VersionId = VersionId;
      }

      Objects.push(obj);
    });
  } catch (error) {
    console.error(error);
  }

  return { Objects, Quiet };
};

export class DeleteObjectsAction extends S3LocalService {
  bucket: string;
  constructor(url: URL, headers: IncomingHttpHeaders) {
    super(headers);

    const filePath = decodeURIComponent(url.pathname.replace("/%40s3/", "").replace("/@s3/", ""));
    const [bucket] = filePath.split("/").filter(Boolean);

    this.bucket = bucket;
  }
  async exec(res: ServerResponse, req: IncomingMessage) {
    if (this.hasNot(this.bucket, res)) {
      return;
    }

    const body = (await collectBody(req)) as string;

    const { Objects, Quiet } = parseBody(body);

    if (!Objects.length) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/xml");
      res.setHeader("x-amzn-requestid", this.requestId);
      res.setHeader("Server", "AmazonS3");
      res.end(
        `<Error><Code>MalformedXML</Code><Message>The XML you provided was not well-formed or did not validate against our published schema</Message><RequestId>${this.requestId}</RequestId><HostId>local</HostId></Error>`
      );
      return;
    }

    const DeleteResult = Objects.map((x) => `<Deleted><Key>${x.Key}</Key></Deleted>`).join("");

    const sourceIPAddress = req.socket.remoteAddress?.split(":")?.[3] ?? "127.0.0.1";

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/xml");
    res.setHeader("x-amzn-requestid", this.requestId);
    res.setHeader("Server", "AmazonS3");
    res.end(`<?xml version="1.0" encoding="UTF-8"?><DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${DeleteResult}</DeleteResult>`);

    for (const obj of Objects) {
      await S3LocalService.removeObject(this.bucket, obj.Key, sourceIPAddress, this.requestId);
    }
  }
}
