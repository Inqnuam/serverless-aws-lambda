import { S3LocalService, type LocalS3Object } from "./localAction";

import type { IncomingHttpHeaders, ServerResponse, IncomingMessage } from "http";
import { createWriteStream } from "fs";
import path from "path";
import { mkdir, readFile, stat } from "fs/promises";
import { triggerEvent } from "../triggerEvent";
import { calulcateETag } from "../calulcateETag";
import { BadRequest, InvalidArgument, InvalidTag } from "../errors/s3Error";
import { MAX_OBJECT_TAGS, TAG_KEY_MAX_LEN, TAG_KEY_MIN_LEN, TAG_VALUE_MAX_LEN } from "../commons/constants";

export class PutObjectAction extends S3LocalService {
  bucket: string;
  key: string;
  contentType: string;
  cacheControl?: string;

  contentDisposition?: string;
  contentEncoding?: string;
  contentLanguage?: string;
  websiteRedirectLocation?: string;
  expires?: number;
  storageClass: LocalS3Object["StorageClass"] = "STANDARD";
  tagging?: string;
  constructor(url: URL, headers: IncomingHttpHeaders) {
    super(headers);
    const [bucket, ...rest] = decodeURIComponent(url.pathname.replace("/%40s3/", "").replace("/@s3/", "")).split("/").filter(Boolean);

    this.bucket = bucket;
    this.key = rest.join("/");

    this.contentType = (headers["content-type"] as string) ?? "application/octet-stream";
    this.cacheControl = headers["cache-control"];

    this.contentDisposition = headers["content-disposition"];
    this.contentEncoding = headers["content-encoding"];
    this.contentLanguage = headers["content-language"];
    this.websiteRedirectLocation = headers["x-amz-website-redirect-location"] as string;
    if (headers["x-amz-tagging"]) {
      this.tagging = headers["x-amz-tagging"] as string;
    }

    const storageClass = headers["x-amz-storage-class"] as LocalS3Object["StorageClass"];
    if (storageClass) {
      this.storageClass = storageClass;
    }
    const expires = new Date(headers["expires"] as string);

    if (!isNaN(expires as unknown as number)) {
      this.expires = expires.getTime();
    }
  }
  async exec(res: ServerResponse, req: IncomingMessage) {
    if (this.hasNot(this.bucket, res)) {
      return;
    }
    if (!this.isValidStorageClass(this.storageClass, res)) {
      return;
    }
    const Tags: Record<string, string> = {};

    if (this.tagging) {
      const resWithError = () => {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/xml");
        res.end(
          new InvalidArgument({
            ArgumentName: "x-amz-tagging",
            ArgumentValue: this.tagging as string,
            Message: "The header 'x-amz-tagging' shall be encoded as UTF-8 then URLEncoded URL query parameters without tag name duplicates.",
            RequestId: this.requestId,
          }).toXml()
        );
      };

      if (typeof this.tagging != "string") {
        return resWithError();
      }

      if (!isValidTagging(this.tagging)) {
        return resWithError();
      }

      const parsedTags = new URLSearchParams(this.tagging);

      for (const TagKey of parsedTags.keys()) {
        // ensure unique Keys
        if (TagKey in Tags) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/xml");
          res.end(new InvalidTag({ TagKey, RequestId: this.requestId, Message: "Cannot provide multiple Tags with the same key" }).toXml());
          return;
        }

        if (TagKey.length > TAG_KEY_MAX_LEN || TagKey.length < TAG_KEY_MIN_LEN) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/xml");
          res.end(new InvalidTag({ TagKey, RequestId: this.requestId, Message: "The TagKey you have provided is invalid" }).toXml());
          return;
        }

        const Value = parsedTags.get(TagKey)!;
        if (Value.length > TAG_VALUE_MAX_LEN) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/xml");
          res.end(new InvalidTag({ TagKey, RequestId: this.requestId, Message: "The TagValue you have provided is invalid" }).toXml());
          return;
        }

        Tags[TagKey] = Value;
      }
    }

    const tagsLen = Object.keys(Tags).length;

    if (tagsLen > MAX_OBJECT_TAGS) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/xml");
      res.end(new BadRequest({ Message: `Object tag count cannot be greater than ${MAX_OBJECT_TAGS}`, RequestId: this.requestId }).toXml());
      return;
    }

    const currentKey = S3LocalService.genLocalKey(this.bucket, this.key);
    const filePath = path.join(S3LocalService.localStoragePath, this.bucket, currentKey);
    try {
      await mkdir(path.dirname(filePath), { recursive: true });
    } catch (error) {}
    const savingFile = createWriteStream(filePath);

    savingFile.on("close", async () => {
      try {
        const fileStat = await stat(filePath);
        const ETag = calulcateETag(await readFile(filePath));

        S3LocalService.persistence.buckets[this.bucket].objects[this.key] = {
          currentKey,
          type: this.contentType,
          cacheControl: this.cacheControl,
          contentDisposition: this.contentDisposition,
          contentEncoding: this.contentEncoding,
          contentLanguage: this.contentLanguage,
          expires: this.expires,
          websiteRedirectLocation: this.websiteRedirectLocation,
          ETag,
          size: fileStat.size,
          LastModified: fileStat.mtimeMs,
          StorageClass: this.storageClass,
          metadata: this.metadata,
          versions: {
            [currentKey]: {},
          },
          tags: tagsLen ? Tags : undefined,
        };
        const sourceIPAddress = req.socket.remoteAddress?.split(":")?.[3] ?? "127.0.0.1";
        res.end();
        await triggerEvent(S3LocalService.callableLambdas, {
          bucket: this.bucket,
          key: this.key,
          requestId: this.requestId,
          requestCmd: "PutObject",
          eTag: ETag,
          sourceIPAddress,
          size: fileStat.size,
        });
      } catch (error) {
        console.log(error);
      }
    });

    res.setHeader("status", 100);
    res.setHeader("Server", "AmazonS3");
    res.setHeader("x-amzn-requestid", this.requestId);

    req.pipe(savingFile);
  }
}

const isValidTagging = (tagging: string) => {
  // check if for each Key theres a value (empty allowed), otherwise tagging string is not correctly encoded
  return !tagging.split("&").find((x) => x.split("=").length > 2);
};
