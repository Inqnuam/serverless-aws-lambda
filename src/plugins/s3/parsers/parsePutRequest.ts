import type { IncomingMessage } from "http";
import { PutObjectAction } from "../actions/PutObjectAction";
import { CreateBucketAction } from "../actions/CreateBucketAction";
import { UnknownAction } from "../actions/UnknownAction";
import { CopyObjectAction } from "../actions/CopyObjectAction";

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
      default:
        break;
    }
  } else {
    if (!requestCmd) {
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
