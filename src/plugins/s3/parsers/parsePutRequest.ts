import type { IncomingMessage } from "http";
import { PutObjectAction } from "../actions/PutObjectAction";
import { CreateBucketAction } from "../actions/CreateBucketAction";
import { UnknownAction } from "../actions/UnknownAction";
import { CopyObjectAction } from "../actions/CopyObjectAction";
import { PutBucketTaggingAction } from "../actions/PutBucketTaggingAction";
import { PutObjectTaggingAction } from "../actions/PutObjectTaggingAction";
import { PutBucketPolicyAction } from "../actions/PutBucketPolicyAction";
import { PutBucketCorsAction } from "../actions/PutBucketCorsAction";
import { PutBucketAclAction } from "../actions/PutBucketAclAction";
import { PutObjectAclAction } from "../actions/PutObjectAclAction";

export const parsePutRequest = (req: IncomingMessage) => {
  const { url, headers } = req;
  const parsedURL = new URL(url as string, "http://localhost:3000");

  const requestCmd = parsedURL.searchParams.get("x-id");
  const ua = headers["user-agent"];

  if (ua && ua.startsWith("aws-cli")) {
    const [, rawCmd] = ua.split("command/");
    const [, ..._cmd] = rawCmd.split(".");
    const cmd = _cmd.join(".");

    const isCopyAction = typeof headers["x-amz-copy-source"] == "string";
    switch (cmd) {
      case "cp":
      case "sync":
      case "mv":
        if (isCopyAction) {
          return new CopyObjectAction(parsedURL, headers);
        }
        return new PutObjectAction(parsedURL, headers);

      case "mb":
      case "create-bucket":
        return new CreateBucketAction(parsedURL, headers);
      case "copy-object":
        return new CopyObjectAction(parsedURL, headers);
      case "put-object":
        return new PutObjectAction(parsedURL, headers);
      case "put-bucket-tagging":
        return new PutBucketTaggingAction(parsedURL, headers);
      case "put-object-tagging":
        return new PutObjectTaggingAction(parsedURL, headers);
      case "put-bucket-policy":
        return new PutBucketPolicyAction(parsedURL, headers);
      case "put-bucket-cors":
        return new PutBucketCorsAction(parsedURL, headers);
      case "put-bucket-acl":
        return new PutBucketAclAction(parsedURL, headers);
      case "put-object-acl":
        return new PutObjectAclAction(parsedURL, headers);
      default:
        break;
    }
  } else {
    if (!requestCmd) {
      const requestIsForBucket = parsedURL.pathname.replace("/%40s3/", "").replace("/@s3/", "").split("/").filter(Boolean).length == 1;

      if (parsedURL.searchParams.has("policy")) {
        return new PutBucketPolicyAction(parsedURL, headers);
      }

      if (parsedURL.searchParams.has("cors")) {
        return new PutBucketCorsAction(parsedURL, headers);
      }

      if (parsedURL.searchParams.has("acl")) {
        if (requestIsForBucket) {
          return new PutBucketAclAction(parsedURL, headers);
        }

        return new PutObjectAclAction(parsedURL, headers);
      }

      if (parsedURL.searchParams.has("tagging")) {
        if (requestIsForBucket) {
          return new PutBucketTaggingAction(parsedURL, headers);
        }

        return new PutObjectTaggingAction(parsedURL, headers);
      }

      return new CreateBucketAction(parsedURL, headers);
    }
    if (requestCmd == "PutObject") {
      return new PutObjectAction(parsedURL, headers);
    }
    if (requestCmd == "CopyObject") {
      return new CopyObjectAction(parsedURL, headers);
    }
  }

  return new UnknownAction(parsedURL, headers);
};
