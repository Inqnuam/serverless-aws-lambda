interface IGeneric {
  RequestId: string;
  Code?: string;
  Message: string;
  SenderFault?: boolean;
}

export class SqsError extends Error {
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
    return SqsError.genericErrorResponse({
      RequestId,
      Code: this.Code,
      Message: this.message,
      SenderFault: this.SenderFault,
    });
  }
  static genericErrorResponse({ RequestId, Code, Message, SenderFault }: IGeneric) {
    return `<?xml version="1.0"?>
    <ErrorResponse xmlns="http://queue.amazonaws.com/doc/2012-11-05/">
        <Error>
            <Type>${SenderFault ? "Sender" : "Server"}</Type>
            <Code>${Code ?? "UnknownOperation"}</Code>
            <Message>${Message}</Message>
            <Detail/>
        </Error>
        <RequestId>${RequestId}</RequestId>
    </ErrorResponse>`;
  }
}
