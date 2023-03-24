import { headerTooLarge, badRequest } from "./htmlStatusMsg";

const headerError = new Error(headerTooLarge);

const maxHeaderSize = {
  alb: 65536,
  apg: 10240,
};

const singleAlbHeaderSize = 16376;

export const checkHeaders = (headers: { [key: string]: any }, kind: "alb" | "apg") => {
  if (!headers.host) {
    throw new Error(badRequest);
  }
  let total = 0;
  const maximumAllowedSize = maxHeaderSize[kind];
  const entries = Object.entries(headers);

  if (kind == "alb") {
    entries.forEach((entry) => {
      const [k, v] = entry;
      if (v == "x-mock-type") {
        return;
      }
      const headerLength = k.length + v.length;
      if (headerLength > singleAlbHeaderSize) {
        throw headerError;
      }

      total = total + headerLength;
    });
  } else {
    entries.forEach((entry) => {
      const [k, v] = entry;
      if (v == "x-mock-type") {
        return;
      }
      total = total + k.length + v.length;
    });
  }
  if (total > maximumAllowedSize) {
    throw headerError;
  }
};
