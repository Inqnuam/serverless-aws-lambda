const parse = (event, spotText) => {
  const files = [];
  let body = {};
  const boundary = event.headers?.["content-type"]?.split("=")[1];
  if (!boundary) {
    return {
      files,
      body,
    };
  }
  const result = {};

  event.body.split(boundary).forEach((item) => {
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

const bodyParser = (error, req, res, next) => {
  try {
    const parsedBody = parse(req, true);
    req.files = parsedBody.files;
    req.body = parsedBody.body;
  } catch (error) {}

  next();
};
module.exports = bodyParser;
module.exports.bodyParser = bodyParser;
