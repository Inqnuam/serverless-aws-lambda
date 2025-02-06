import type { IncomingMessage } from "http";
import { DeleteObjectsAction } from "../actions/DeleteObjectsAction";
import { UnknownAction } from "../actions/UnknownAction";

export const parsePostRequest = (req: IncomingMessage) => {
  const { url, headers } = req;
  const parsedURL = new URL(url as string, "http://localhost:3000");
  const isDelete = parsedURL.searchParams.has("delete");
  const requestIsForBucket = parsedURL.pathname.replace("/%40s3/", "").replace("/@s3/", "").split("/").filter(Boolean).length == 1;

  if (isDelete && requestIsForBucket) {
    return new DeleteObjectsAction(parsedURL, headers);
  }

  return new UnknownAction(parsedURL, headers);
};
