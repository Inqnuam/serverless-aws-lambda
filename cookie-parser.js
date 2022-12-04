function tryDecode(str, decode) {
  try {
    return decode(str);
  } catch (e) {
    return str;
  }
}
function decode(str) {
  return str.indexOf("%") !== -1 ? decodeURIComponent(str) : str;
}

const parse = (str, options) => {
  if (typeof str !== "string") {
    throw new TypeError("argument str must be a string");
  }

  let obj = {};
  let opt = options || {};
  let dec = opt.decode || decode;

  let index = 0;
  while (index < str.length) {
    let eqIdx = str.indexOf("=", index);

    // no more cookie pairs
    if (eqIdx === -1) {
      break;
    }

    let endIdx = str.indexOf(";", index);

    if (endIdx === -1) {
      endIdx = str.length;
    } else if (endIdx < eqIdx) {
      // backtrack on prior semicolon
      index = str.lastIndexOf(";", eqIdx - 1) + 1;
      continue;
    }

    let key = str.slice(index, eqIdx).trim();

    // only assign once
    if (undefined === obj[key]) {
      let val = str.slice(eqIdx + 1, endIdx).trim();

      // quoted values
      if (val.charCodeAt(0) === 0x22) {
        val = val.slice(1, -1);
      }

      obj[key] = tryDecode(val, dec);
    }

    index = endIdx + 1;
  }

  return obj;
};

const cookieParser = (error, req, res, next) => {
  try {
    req.cookies = typeof req.headers.cookie == "string" ? parse(req.headers.cookie) : {};
  } catch (error) {}
  next();
};

module.exports = cookieParser;
module.exports.cookieParser = cookieParser;
