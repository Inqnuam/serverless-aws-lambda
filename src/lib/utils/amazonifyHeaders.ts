const fixCookiePath = (cookie: string) => {
  const components = cookie.split(";");
  const foundPathIndex = components.findIndex((x) => x.toLowerCase().startsWith("path="));

  if (foundPathIndex == -1) {
    components.push("Path=/");
  }
  return components.join(";");
};
export const amazonifyHeaders = (_headers?: { [key: string]: string | any[] }, cookies?: string[]) => {
  let headers: any = {};
  if (_headers) {
    Object.entries(_headers).forEach(([key, value]) => {
      headers[key.toLowerCase()] = Array.isArray(value) ? `[${value.join(", ")}]` : value;
    });
  }

  if (Array.isArray(cookies)) {
    if (!cookies.every((x) => typeof x == "string")) {
      // @ts-ignore
      const err = new Error("Wrong 'cookies'. must be string[]", { cause: cookies });
      let returnHeaders: any = {
        "Content-Type": headers["content-type"] ?? "application/json",
        "x-amzn-ErrorType": "InternalFailure",
      };
      if (headers["set-cookie"]) {
        returnHeaders["set-cookie"] = headers["set-cookie"];
      }
      // @ts-ignore
      err.headers = returnHeaders;

      throw err;
    }

    cookies = cookies.map(fixCookiePath);
    headers["set-cookie"] = headers["set-cookie"] ? [headers["set-cookie"], ...cookies] : cookies;
  }

  return headers;
};
