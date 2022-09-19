export interface SetCookieOptions {
    domain: string;
    encode: Function;
    expires: Date | number;
    httpOnly: boolean;
    maxAge: number;
    path: string;
    priority: string;
    secure: boolean;
    signed: boolean;
    sameSite: boolean | string;
  }


const fieldContentRegExp = /^[\u0009\u0020-\u007e\u0080-\u00ff]+$/;
const encode = function encode(val: string) {
  return encodeURIComponent(val);
};
function tryDecode(str: string, decode: Function) {
  try {
    return decode(str);
  } catch (e) {
    return str;
  }
}
function decode(str: string) {
  return str.indexOf("%") !== -1 ? decodeURIComponent(str) : str;
}

function isDate(val: any) {
  return Object.prototype.toString.call(val) === "[object Date]" || val instanceof Date;
}

export const cookie = {
  serialize: (name: string, val: string, options?: any) => {
    var opt = options || {};
    var enc = opt.encode || encode;

    if (typeof enc !== "function") {
      throw new TypeError("option encode is invalid");
    }

    if (!fieldContentRegExp.test(name)) {
      throw new TypeError("argument name is invalid");
    }

    var value = enc(val);

    if (value && !fieldContentRegExp.test(value)) {
      throw new TypeError("argument val is invalid");
    }

    var str = name + "=" + value;

    if (null != opt.maxAge) {
      var maxAge = opt.maxAge - 0;

      if (isNaN(maxAge) || !isFinite(maxAge)) {
        throw new TypeError("option maxAge is invalid");
      }

      str += "; Max-Age=" + Math.floor(maxAge);
    }

    if (opt.domain) {
      if (!fieldContentRegExp.test(opt.domain)) {
        throw new TypeError("option domain is invalid");
      }

      str += "; Domain=" + opt.domain;
    }

    if (opt.path) {
      if (!fieldContentRegExp.test(opt.path)) {
        throw new TypeError("option path is invalid");
      }

      str += "; Path=" + opt.path;
    }

    if (opt.expires) {
      var expires = opt.expires;

      if (!isDate(expires) || isNaN(expires.valueOf())) {
        throw new TypeError("option expires is invalid");
      }

      str += "; Expires=" + expires.toUTCString();
    }

    if (opt.httpOnly) {
      str += "; HttpOnly";
    }

    if (opt.secure) {
      str += "; Secure";
    }

    if (opt.priority) {
      var priority = typeof opt.priority === "string" ? opt.priority.toLowerCase() : opt.priority;

      switch (priority) {
        case "low":
          str += "; Priority=Low";
          break;
        case "medium":
          str += "; Priority=Medium";
          break;
        case "high":
          str += "; Priority=High";
          break;
        default:
          throw new TypeError("option priority is invalid");
      }
    }

    if (opt.sameSite) {
      var sameSite = typeof opt.sameSite === "string" ? opt.sameSite.toLowerCase() : opt.sameSite;

      switch (sameSite) {
        case true:
          str += "; SameSite=Strict";
          break;
        case "lax":
          str += "; SameSite=Lax";
          break;
        case "strict":
          str += "; SameSite=Strict";
          break;
        case "none":
          str += "; SameSite=None";
          break;
        default:
          throw new TypeError("option sameSite is invalid");
      }
    }

    return str;
  },
  parse: (str: string, options?: any) => {
    if (typeof str !== "string") {
      throw new TypeError("argument str must be a string");
    }

    var obj: any = {};
    var opt = options || {};
    var dec = opt.decode || decode;

    var index = 0;
    while (index < str.length) {
      var eqIdx = str.indexOf("=", index);

      // no more cookie pairs
      if (eqIdx === -1) {
        break;
      }

      var endIdx = str.indexOf(";", index);

      if (endIdx === -1) {
        endIdx = str.length;
      } else if (endIdx < eqIdx) {
        // backtrack on prior semicolon
        index = str.lastIndexOf(";", eqIdx - 1) + 1;
        continue;
      }

      var key = str.slice(index, eqIdx).trim();

      // only assign once
      if (undefined === obj[key]) {
        var val = str.slice(eqIdx + 1, endIdx).trim();

        // quoted values
        if (val.charCodeAt(0) === 0x22) {
          val = val.slice(1, -1);
        }

        obj[key] = tryDecode(val, dec);
      }

      index = endIdx + 1;
    }

    return obj;
  },
};
