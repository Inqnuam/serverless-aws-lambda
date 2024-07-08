export class S3Error extends Error {
  statusCode?: number;
  Code: string;
  SenderFault: boolean = true;
  RequestId: string;
  constructor({ Code, Message, SenderFault, RequestId, statusCode }: { Code: string; Message: string; SenderFault?: boolean; statusCode?: number; RequestId: string }) {
    super(Message);
    this.Code = Code;
    this.RequestId = RequestId;
    this.statusCode = statusCode;
    if (typeof SenderFault == "boolean") {
      this.SenderFault = SenderFault;
    }
  }

  toXml(info: string = "") {
    return S3Error.genericError({ Code: this.Code, Message: this.message, RequestId: this.RequestId, info });
  }

  static genericError({ Code, Message, RequestId, info }: { Code: string; Message: string; RequestId: string; info?: string }) {
    return `<?xml version="1.0" encoding="UTF-8"?>
    <Error><Code>${Code}</Code><Message>${Message}</Message>${info ?? ""}<RequestId>${RequestId}</RequestId><HostId>local</HostId></Error>`;
  }
}

export class InvalidTag extends S3Error {
  TagKey: string;
  constructor({ TagKey, Message, RequestId }: { TagKey: string; Message: string; RequestId: string }) {
    super({ Code: "InvalidTag", Message, SenderFault: true, statusCode: 400, RequestId });
    this.TagKey = TagKey;
  }
  toXml() {
    return super.toXml(`<TagKey>${this.TagKey}</TagKey>`);
  }
}

export class MalformedXML extends S3Error {
  constructor(RequestId: string) {
    super({ Code: "MalformedXML", Message: "The XML you provided was not well-formed or did not validate against our published schema", RequestId });
  }
}

export class BadRequest extends S3Error {
  constructor({ Message, RequestId }: { Message: string; RequestId: string }) {
    super({ Code: "BadRequest", Message: Message, RequestId });
  }
}

export class InvalidArgument extends S3Error {
  ArgumentName: string;
  ArgumentValue: string;
  constructor({ Message, RequestId, ArgumentName, ArgumentValue }: { Message: string; RequestId: string; ArgumentName: string; ArgumentValue: string }) {
    super({ Code: "InvalidArgument", Message, RequestId });
    this.ArgumentName = ArgumentName;
    this.ArgumentValue = ArgumentValue;
  }

  toXml() {
    return super.toXml(`<ArgumentName>${this.ArgumentName}</ArgumentName><ArgumentValue>${this.ArgumentValue}</ArgumentValue>`);
  }
}

export class NoSuchTagSet extends S3Error {
  constructor(RequestId: string) {
    super({ Code: "NoSuchTagSet", Message: "The TagSet does not exist", RequestId, statusCode: 404 });
  }
}

export class UnsupportedCommand extends S3Error {
  constructor(command: string, RequestId: string) {
    super({ Code: "UnsupportedCommand", Message: `${command} is currently not supported`, RequestId, statusCode: 500 });
  }
}
