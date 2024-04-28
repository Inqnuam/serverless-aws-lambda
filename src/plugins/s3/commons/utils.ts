import { createHash, type BinaryLike } from "crypto";

export const md5 = (contents: string | BinaryLike): string => {
  return createHash("md5").update(contents).digest("hex");
};
