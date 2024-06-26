/**
 * Generate an S3 ETAG for multipart uploads in Node.js
 * An implementation of this algorithm: https://stackoverflow.com/a/19896823/492325
 * Author: Richard Willis <willis.rh@gmail.com>
 */
import fs from "node:fs";
import { md5 } from "./commons/utils";

const defaultPartSizeInBytes = 5 * 1024 * 1024; // 5MB

export function calulcateMulipartETag({ fileSizeInBytes, filePath, partSizeInBytes }: { fileSizeInBytes: number; filePath: string; partSizeInBytes?: number }): string {
  const partSize = partSizeInBytes ?? defaultPartSizeInBytes;

  let parts = Math.floor(fileSizeInBytes / partSize);
  if (fileSizeInBytes % partSize > 0) {
    parts += 1;
  }
  const fileDescriptor = fs.openSync(filePath, "r");
  let totalMd5 = "";

  for (let part = 0; part < parts; part++) {
    const skipBytes = partSize * part;
    const totalBytesLeft = fileSizeInBytes - skipBytes;
    const bytesToRead = Math.min(totalBytesLeft, partSize);
    const buffer = Buffer.alloc(bytesToRead);
    fs.readSync(fileDescriptor, buffer, 0, bytesToRead, skipBytes);
    totalMd5 += md5(buffer);
  }

  const combinedHash = md5(Buffer.from(totalMd5, "hex"));
  const etag = `"${combinedHash}-${parts}"`;
  return etag;
}
export const calulcateETag = (content: string | Buffer) => {
  return `"${md5(content)}"`;
};
