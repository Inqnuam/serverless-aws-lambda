import { log } from "../utils/colorize";

export const parseS3 = (event: any) => {
  if (!event || !event.s3) {
    return;
  }

  const declarationType = typeof event.s3;
  if (declarationType == "string") {
    return {
      bucket: event.s3,
      type: ["ObjectCreated", "*"],
    };
  } else if (!Array.isArray(event.s3) && declarationType == "object") {
    if (typeof event.s3.bucket != "string") {
      log.YELLOW("s3 bucket name must be a string");
      return;
    }
    let s3Event: any = {
      bucket: event.s3.bucket,
    };

    if (typeof event.s3.event == "string") {
      s3Event.type = event.s3.event.split(":").slice(1);
    } else {
      s3Event.type = ["ObjectCreated", "*"];
    }

    if (Array.isArray(event.s3.rules)) {
      s3Event.rules = event.s3.rules;
    }

    return s3Event;
  }
};
