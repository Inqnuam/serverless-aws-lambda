interface IGeneric {
  RequestId: string;
  Code?: string;
  Message: string;
  SenderFault?: boolean;
}

export class SnsError extends Error {
  Code: string;
  SenderFault: boolean = true;
  constructor({ Code, Message, SenderFault }: { Code: string; Message: string; SenderFault?: boolean }) {
    super(Message);
    this.Code = Code;
    if (typeof SenderFault == "boolean") {
      this.SenderFault = SenderFault;
    }
  }

  toXml(RequestId: string) {
    return SnsError.genericErrorResponse({
      RequestId,
      Code: this.Code,
      Message: this.message,
      SenderFault: this.SenderFault,
    });
  }
  static genericErrorResponse({ RequestId, Code, Message, SenderFault }: IGeneric) {
    return `<?xml version="1.0"?>
    <ErrorResponse xmlns="http://sns.amazonaws.com/doc/2010-03-31/">
        <Error>
            <Type>${SenderFault ? "Sender" : "Server"}</Type>
            <Code>${Code ?? "UnknownOperation"}</Code>
            <Message>${Message}</Message>
        </Error>
        <RequestId>${RequestId}</RequestId>
    </ErrorResponse>`;
  }
}
