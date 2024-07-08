import type { IncomingMessage } from "http";
import { ListObjectsV2Action, ListObjectsV1Action } from "../actions/ListObjectsAction";
import { ListBucketsAction } from "../actions/ListBucketsAction";
import { GetObjectAction } from "../actions/GetObjectAction";
import { UnknownAction } from "../actions/UnknownAction";
import { GetObjectTaggingAction } from "../actions/GetObjectTaggingAction";
import { GetBucketTaggingAction } from "../actions/GetBucketTaggingAction";

export const parseGetRequest = (req: IncomingMessage) => {
  const { url, headers } = req;
  const parsedURL = new URL(url as string, "http://localhost:3000");

  const requestCmd = parsedURL.searchParams.get("x-id");
  const ua = headers["user-agent"];
  const requestIsForBucket = parsedURL.pathname.replace("/%40s3/", "").replace("/@s3/", "").split("/").filter(Boolean).length == 1;

  if (ua && ua.startsWith("aws-cli")) {
    const [, rawCmd] = ua.split("command/");
    const [, ..._cmd] = rawCmd.split(".");
    const cmd = _cmd.join(".");

    switch (cmd) {
      case "ls":
        if (/@s3\/?$/.test(url!)) {
          return new ListBucketsAction(parsedURL, headers);
        }

        if (parsedURL.searchParams.get("list-type") == "2") {
          return new ListObjectsV2Action(parsedURL, headers);
        }
        return new ListObjectsV1Action(parsedURL, headers);

      case "list-buckets":
        return new ListBucketsAction(parsedURL, headers);
      case "list-objects":
        return new ListObjectsV1Action(parsedURL, headers);
      case "list-objects-v2":
        return new ListObjectsV2Action(parsedURL, headers);
      case "rb.rm":
        if (parsedURL.searchParams.get("list-type") == "2") {
          return new ListObjectsV2Action(parsedURL, headers);
        }
        return new ListObjectsV1Action(parsedURL, headers);

      case "get-object":
        return new GetObjectAction(parsedURL, headers);

      case "cp":
      case "mv":
      case "sync":
        if (!requestIsForBucket) {
          return new GetObjectAction(parsedURL, headers);
        }
        if (parsedURL.searchParams.get("list-type") == "2") {
          return new ListObjectsV2Action(parsedURL, headers);
        }
        return new ListObjectsV1Action(parsedURL, headers);

      case "get-bucket-tagging":
        return new GetBucketTaggingAction(parsedURL, headers);
      case "get-object-tagging":
        return new GetObjectTaggingAction(parsedURL, headers);
      default:
        break;
    }
  } else {
    if (!requestCmd) {
      if (parsedURL.searchParams.has("tagging")) {
        if (requestIsForBucket) {
          return new GetBucketTaggingAction(parsedURL, headers);
        }
        return new GetObjectTaggingAction(parsedURL, headers);
      }

      if (url!.endsWith("@s3/")) {
        return new ListBucketsAction(parsedURL, headers);
      }

      if (parsedURL.searchParams.get("list-type") == "2") {
        return new ListObjectsV2Action(parsedURL, headers);
      }
      return new ListObjectsV1Action(parsedURL, headers);
    }

    if (requestCmd == "GetObject") {
      return new GetObjectAction(parsedURL, headers);
    }
  }

  return new UnknownAction(parsedURL, headers);
};
