import type { RouteController, IRequest } from "../lambda/router";

const parse = (event: IRequest, spotText: boolean) => {
  const files: any[] = [];
  let body: any = {};
  const boundary = event.headers?.["content-type"]?.split("=")[1];
  if (!boundary) {
    return {
      files,
      body,
    };
  }
  const result: any = {};

  if (event.isBase64Encoded) {
    event.body = Buffer.from(event.body, "base64").toString("utf-8");
  }
  event.body.split(boundary).forEach((item: any) => {
    if (/filename=".+"/g.test(item)) {
      result[item.match(/name=".+";/g)[0].slice(6, -2)] = {
        type: "file",
        filename: item.match(/filename=".+"/g)[0].slice(10, -1),
        contentType: item.match(/Content-Type:\s.+/g)[0].slice(14),
        content: spotText
          ? Buffer.from(item.slice(item.search(/Content-Type:\s.+/g) + item.match(/Content-Type:\s.+/g)[0].length + 4, -4), "binary")
          : item.slice(item.search(/Content-Type:\s.+/g) + item.match(/Content-Type:\s.+/g)[0].length + 4, -4),
      };
    } else if (/name=".+"/g.test(item)) {
      result[item.match(/name=".+"/g)[0].slice(6, -1)] = item.slice(item.search(/name=".+"/g) + item.match(/name=".+"/g)[0].length + 4, -4);
    }
  });

  for (const [key, value] of Object.entries(result)) {
    if (typeof value == "string") {
      body[key] = value;
    } else if (value && typeof value == "object") {
      files.push({
        name: key,
        ...value,
      });
    }
  }

  return {
    files,
    body,
  };
};

const bodyParser: RouteController = (req, res, next) => {
  try {
    const parsedBody = parse(req, true);
    req.files = parsedBody.files;
    req.body = parsedBody.body;
  } catch (error) {}

  next();
};
export default bodyParser;
export { bodyParser };
