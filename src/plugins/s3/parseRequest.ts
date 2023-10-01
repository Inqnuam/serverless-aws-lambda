import type { IncomingMessage } from "http";
import { randomUUID } from "crypto";
import { ListObjectsAction } from "./actions/ListObjectsAction";

export class RequestParser {
  localStorageDir: string;
  constructor(localStorageDir: string) {
    this.localStorageDir = localStorageDir;
  }

  deserialize(req: IncomingMessage) {
    const { url, headers, socket } = req;
    const requestId = (headers["amz-sdk-invocation-id"] as string) ?? randomUUID();
    const parsedURL = new URL(url as string, "http://localhost:3000");
    const sourceIPAddress = socket.remoteAddress?.split(":")?.[3] ?? "127.0.0.1";

    const contentType = (headers["content-type"] as string) ?? "application/octet-stream";
    const cacheControl = headers["cache-control" as string] ?? "no-cache";
    let filePath = decodeURIComponent(parsedURL.pathname.replace("/@s3/", ""));

    const fileComponents = filePath.split("/");
    let bucketName = fileComponents[0];
    let keyName = fileComponents.slice(1).join("/");
    const copySource = `${this.localStorageDir}${headers["x-amz-copy-source"]}`;

    let requestCmd = parsedURL.searchParams.get("x-id");

    if (!requestCmd) {
      if (url!.endsWith("@s3/")) {
        requestCmd = "ListBuckets";
      } else {
        requestCmd = "ListObjects";
        new ListObjectsAction(parsedURL, headers);
      }
    }

    return {
      requestCmd,
      fileComponents,
      filePath: `${this.localStorageDir}${filePath}`,
      bucketName,
      keyName,
      requestId,
      sourceIPAddress,
      copySource,
      contentType,
      cacheControl,
    };
  }
}
