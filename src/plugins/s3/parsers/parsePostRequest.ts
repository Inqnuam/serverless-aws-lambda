import type { IncomingMessage } from "http";
import { DeleteObjectsAction } from "../actions/DeleteObjectsAction";
import { UnknownAction } from "../actions/UnknownAction";

export const parsePostRequest = (req: IncomingMessage) => {
  const { url, headers } = req;
  const parsedURL = new URL(url as string, "http://localhost:3000");
  const isDelete = parsedURL.searchParams.has("delete");
  const ua = headers["user-agent"];

  const requestCmd = parsedURL.searchParams.get("x-id");

  if (ua && ua.startsWith("aws-cli")) {
    const [, rawCmd] = ua.split("command/");
    const [, ..._cmd] = rawCmd.split(".");
    const cmd = _cmd.join(".");

    if (cmd == "delete-objects" && isDelete) {
      return new DeleteObjectsAction(parsedURL, headers);
    }
  }

  if (requestCmd == "DeleteObjects" && isDelete) {
    return new DeleteObjectsAction(parsedURL, headers);
  }

  return new UnknownAction(parsedURL, headers);
};
