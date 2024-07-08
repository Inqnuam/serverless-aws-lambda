import type { IncomingMessage } from "http";
import { DeleteBucketAction } from "../actions/DeleteBucketAction";
import { DeleteObjectAction } from "../actions/DeleteObjectAction";
import { UnknownAction } from "../actions/UnknownAction";
import { DeleteBucketTaggingAction } from "../actions/DeleteBucketTaggingAction";
import { DeleteObjectTaggingAction } from "../actions/DeleteObjectTaggingAction";

const removeObject = new Set(["rm", "rb.rm", "mv", "delete-object"]);
export const parseDeleteRequest = (req: IncomingMessage) => {
  const { url, headers } = req;
  const parsedURL = new URL(url as string, "http://localhost:3000");

  const requestIsForBucket = parsedURL.pathname.replace("/%40s3/", "").replace("/@s3/", "").split("/").filter(Boolean).length == 1;

  if (parsedURL.searchParams.has("tagging")) {
    if (requestIsForBucket) {
      return new DeleteBucketTaggingAction(parsedURL, headers);
    }

    return new DeleteObjectTaggingAction(parsedURL, headers);
  }

  const ua = headers["user-agent"];

  if (ua && ua.startsWith("aws-cli")) {
    const [, rawCmd] = ua.split("command/");
    const [, ..._cmd] = rawCmd.split(".");
    const cmd = _cmd.join(".");

    if (removeObject.has(cmd)) {
      return new DeleteObjectAction(parsedURL, headers);
    }
    if (cmd == "rb" || cmd == "delete-bucket") {
      return new DeleteBucketAction(parsedURL, headers);
    }
  } else {
    const requestCmd = parsedURL.searchParams.get("x-id");

    if (!requestCmd) {
      return new DeleteBucketAction(parsedURL, headers);
    }
    if (requestCmd == "DeleteObject") {
      return new DeleteObjectAction(parsedURL, headers);
    }
  }

  return new UnknownAction(parsedURL, headers);
};
