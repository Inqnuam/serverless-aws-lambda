import type { IncomingMessage } from "http";
import { HeadBucketAction } from "../actions/HeadBucketAction";
import { HeadObjectAction } from "../actions/HeadObjectAction";

export const parseHeadRequest = (req: IncomingMessage) => {
  const { url, headers } = req;
  const parsedURL = new URL(url as string, "http://localhost:3000");

  if (parsedURL.pathname.replace("/@s3/", "").split("/").filter(Boolean).length > 1) {
    return new HeadObjectAction(parsedURL, headers);
  }

  return new HeadBucketAction(parsedURL, headers);
};
