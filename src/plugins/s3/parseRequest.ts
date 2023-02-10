import type { IncomingMessage } from "http";
import { randomUUID } from "crypto";

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
    const requestCmd = parsedURL.searchParams.get("x-id");

    let filePath = decodeURIComponent(parsedURL.pathname.replace("/@s3/", ""));

    const fileComponents = filePath.split("/");
    const bucketName = fileComponents[0];
    const keyName = fileComponents.slice(1).join("/");
    const copySource = `${this.localStorageDir}${headers["x-amz-copy-source"]}`;

    return {
      requestCmd,
      fileComponents,
      filePath: `${this.localStorageDir}${filePath}`,
      bucketName,
      keyName,
      requestId,
      sourceIPAddress,
      copySource,
    };
  }
}
