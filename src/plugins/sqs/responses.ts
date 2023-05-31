import { parseAttributes } from "./parser";

const xmlVersion = `<?xml version="1.0"?>`;
const xmlns = `xmlns="http://queue.amazonaws.com/doc/2012-11-05/"`;

const reqId = (RequestId: string) => `<RequestId>${RequestId}</RequestId>`;
const ResponseMetadata = (RequestId: string) => `<ResponseMetadata>${reqId(RequestId)}</ResponseMetadata>`;
const ErrorResponse = (RequestId: string, Error: { Type?: string; Code: string; Message: string; Detail?: string }) => `${xmlVersion}<ErrorResponse ${xmlns}>
<Error>
<Type>Sender</Type>
<Code>${Error.Code}</Code>
<Message>${Error.Message}</Message>
<Detail/>
</Error>
${reqId(RequestId)}
</ErrorResponse>`;

export const SendMessageResponse = (record: any, RequestId: string) => {
  let SendMessageResult = `<MD5OfMessageBody>${record.md5OfBody}</MD5OfMessageBody>\n`;

  if (record.md5OfMessageAttributes) {
    SendMessageResult += `<MD5OfMessageAttributes>${record.md5OfMessageAttributes}</MD5OfMessageAttributes>\n`;
  }

  if (record.attributes.AWSTraceHeader) {
    // NOTE: as currently only "AWSTraceHeader" is allowed by AWS, we de not calculate md5 every time
    SendMessageResult += "<MD5OfMessageSystemAttributes>5f48eef650c1d0207456969c85af2fdd</MD5OfMessageSystemAttributes>";
  }

  SendMessageResult += `<MessageId>${record.messageId}</MessageId>`;

  const body = `${xmlVersion}<SendMessageResponse ${xmlns}>
      <SendMessageResult>
         ${SendMessageResult}
      </SendMessageResult>
      ${ResponseMetadata(RequestId)}
  </SendMessageResponse>`;

  return body;
};

export const SendMessageBatchResponse = (success: any[], failures: any[], RequestId: string) => {
  let SendMessageBatchResult = "";

  success.forEach((record) => {
    SendMessageBatchResult += "<SendMessageBatchResultEntry>\n";

    Object.entries(record).forEach((x) => {
      const [k, v] = x;

      SendMessageBatchResult += `<${k}>${v}</${k}>\n`;
    });

    SendMessageBatchResult += `</SendMessageBatchResultEntry>\n`;
  });

  failures.forEach((record) => {
    SendMessageBatchResult += "<BatchResultErrorEntry>\n";

    Object.entries(record).forEach((x) => {
      const [k, v] = x;

      SendMessageBatchResult += `<${k}>${v}</${k}>\n`;
    });

    SendMessageBatchResult += `</BatchResultErrorEntry>\n`;
  });

  const body = `${xmlVersion}<SendMessageBatchResponse ${xmlns}>
      <SendMessageBatchResult>
          ${SendMessageBatchResult}
      </SendMessageBatchResult>
      ${ResponseMetadata(RequestId)}
      </SendMessageBatchResponse>`;
  return body;
};

export const PurgeQueueResponse = (RequestId: string) => {
  return `${xmlVersion}<PurgeQueueResponse ${xmlns}>
  ${ResponseMetadata(RequestId)}
  </PurgeQueueResponse>`;
};

export const PurgeQueueErrorResponse = (RequestId: string, queueName: string) =>
  ErrorResponse(RequestId, { Code: "AWS.SimpleQueueService.PurgeQueueInProgress", Message: `Only one PurgeQueue operation on ${queueName} is allowed every 60 seconds.` });

export const queueNotFound = (RequestId: string) =>
  ErrorResponse(RequestId, { Code: "AWS.SimpleQueueService.NonExistentQueue", Message: `The specified queue does not exist for this wsdl version.` });

export const ReceiveMessageResponse = (RequestId: string, records: any[], AttributeNames?: string[], MessageAttributeNames?: string[]) => {
  let ReceiveMessageResult = "<ReceiveMessageResult>\n";

  if (records.length) {
    records.forEach((record) => {
      ReceiveMessageResult += `<Message>
        <MessageId>${record.messageId}</MessageId>
        <ReceiptHandle>${record.receiptHandle}</ReceiptHandle>
        <MD5OfBody>${record.md5OfBody}</MD5OfBody>
        <Body>${record.body.replace(/"/g, "&quot;")}</Body>\n`;

      if (Array.isArray(AttributeNames)) {
        const hasAllAttrib = AttributeNames.find((x) => x == "All");
        if (hasAllAttrib) {
          Object.entries(record.attributes).forEach((x) => {
            const [k, v] = x;
            ReceiveMessageResult += `<Attribute>
              <Name>${k}</Name>
              <Value>${v}</Value>
          </Attribute>\n`;
          });
        } else {
          AttributeNames.forEach((x) => {
            if (record.attributes[x]) {
              ReceiveMessageResult += `<Attribute>
                <Name>${x}</Name>
                <Value>${record.attributes[x]}</Value>
            </Attribute>\n`;
            }
          });
        }
      }

      if (record.messageAttributes && Array.isArray(MessageAttributeNames)) {
        const hasAllAttrib = MessageAttributeNames.find((x) => x == "All" || x == ".*");
        let collectMsgAttrbs: any = {};

        if (hasAllAttrib) {
          Object.entries(record.messageAttributes).forEach((x) => {
            const [k, v]: [string, any] = x;
            collectMsgAttrbs[k] = {
              StringValue: v.stringValue,
              DataType: v.dataType,
            };

            ReceiveMessageResult += `<MessageAttribute>
              <Name>${k}</Name>
              <Value>
                <StringValue>${v.stringValue}</StringValue>
                <DataType>${v.dataType}</DataType>
              </Value>
          </MessageAttribute>\n`;
          });
        } else {
          MessageAttributeNames.forEach((x) => {
            const keys = Object.keys(record.messageAttributes).filter((a) => {
              if (x.endsWith(".*")) {
                const prefix = x.split(".")[0];
                return a.startsWith(prefix);
              }
              return a == x;
            });
            if (!keys.length) {
              return;
            }

            keys.forEach((key) => {
              const attrib = record.messageAttributes[key];
              if (attrib) {
                collectMsgAttrbs[key] = {
                  StringValue: attrib.stringValue,
                  DataType: attrib.dataType,
                };

                ReceiveMessageResult += `<MessageAttribute>
                <Name>${key}</Name>
                <Value>
                  <StringValue>${attrib.stringValue}</StringValue>
                  <DataType>${attrib.dataType}</DataType>
                </Value>
            </MessageAttribute>\n`;
              }
            });
          });
        }

        if (Object.keys(collectMsgAttrbs).length) {
          const { md5OfMessageAttributes } = parseAttributes(collectMsgAttrbs);
          ReceiveMessageResult += `<MD5OfMessageAttributes>${md5OfMessageAttributes}</MD5OfMessageAttributes>`;
        }
      }

      ReceiveMessageResult += "</Message>\n";
    });
    ReceiveMessageResult += "</ReceiveMessageResult>";
  } else {
    ReceiveMessageResult = "<ReceiveMessageResult/>\n";
  }

  const body = `${xmlVersion}
  <ReceiveMessageResponse ${xmlns}>
     ${ReceiveMessageResult}  
     ${ResponseMetadata(RequestId)}
  </ReceiveMessageResponse>`;

  return body;
};

export const ChangeMessageVisibilityResponse = (RequestId: string) => `${xmlVersion}<ChangeMessageVisibilityResponse>
${ResponseMetadata(RequestId)}
  </ChangeMessageVisibilityResponse>`;

export const ChangeMessageVisibilityError = (RequestId: string, receiptHandle: string) =>
  ErrorResponse(RequestId, {
    Code: "InvalidParameterValue",
    Message: `Value &quot;${receiptHandle}&quot; for parameter ReceiptHandle is invalid. Reason: Message does not exist or is not available for visibility timeout change.`,
  });

export const ChangeMessageVisibilityBatchResponse = (success: any[], failures: any[], RequestId: string) => {
  let succeed = success
    .map(
      (x) => `<ChangeMessageVisibilityBatchResultEntry>
<Id>${x}</Id>
</ChangeMessageVisibilityBatchResultEntry>`
    )
    .join("\n");

  let fails = failures
    .map(
      (x) => `<BatchResultErrorEntry>
    <Id>${x.id}</Id>
    <Code>ReceiptHandleIsInvalid</Code>
    <Message>The input receipt handle &quot;${x.receiptHandle}&quot; is not a valid receipt handle.</Message>
    <SenderFault>true</SenderFault>
</BatchResultErrorEntry>`
    )
    .join("\n");

  const body = `${xmlVersion}<ChangeMessageVisibilityBatchResponse ${xmlns}>
    <ChangeMessageVisibilityBatchResult>
        ${succeed}
        ${fails}
    </ChangeMessageVisibilityBatchResult>
    ${ResponseMetadata(RequestId)}
</ChangeMessageVisibilityBatchResponse>`;

  return body;
};

// this weird message is copied from AWS :)
export const EmptyBatchRequest = (RequestId: string) =>
  ErrorResponse(RequestId, { Code: "MissingParameter", Message: `The request must contain the parameter ChangeMessageVisibilityBatchRequestEntry.1.Id.` });

export const TooManyEntriesInBatchRequest = (RequestId: string, entryLenght: number) =>
  ErrorResponse(RequestId, { Code: "AWS.SimpleQueueService.TooManyEntriesInBatchRequest", Message: `Maximum number of entries per request are 10. You have sent ${entryLenght}.` });

export const BatchEntryIdsNotDistinct = (RequestId: string, repetedId: string) =>
  ErrorResponse(RequestId, { Code: "AWS.SimpleQueueService.BatchEntryIdsNotDistinct", Message: `Id ${repetedId} repeated.` });

export const InvalidBatchEntryId = (RequestId: string) =>
  ErrorResponse(RequestId, {
    Code: "AWS.SimpleQueueService.InvalidBatchEntryId",
    Message: `A batch entry id can only contain alphanumeric characters, hyphens and underscores. It can be at most 80 letters long.`,
  });

export const DeleteMessageResponse = (RequestId: string) => `${xmlVersion}<DeleteMessageResponse ${xmlns}>
${ResponseMetadata(RequestId)}
</DeleteMessageResponse>`;

export const DeleteMessageBatchResponse = (success: any[], failures: any[], RequestId: string) => {
  let succeed = success
    .map(
      (x) => `<DeleteMessageBatchResultEntry>
<Id>${x}</Id>
</DeleteMessageBatchResultEntry>`
    )
    .join("\n");

  let fails = failures
    .map(
      (x) => `<BatchResultErrorEntry>
    <Id>${x.id}</Id>
    <Code>ReceiptHandleIsInvalid</Code>
    <Message>The input receipt handle &quot;${x.receiptHandle}&quot; is not a valid receipt handle.</Message>
    <SenderFault>true</SenderFault>
</BatchResultErrorEntry>`
    )
    .join("\n");

  const body = `${xmlVersion}
  <DeleteMessageBatchResponse ${xmlns}>
      <DeleteMessageBatchResult>
        ${succeed}
        ${fails}
      </DeleteMessageBatchResult>
      ${ResponseMetadata(RequestId)}
  </DeleteMessageBatchResponse>`;

  return body;
};

export const ReceiptHandleIsInvalid = (RequestId: string, receiptHandle: string) =>
  ErrorResponse(RequestId, {
    Code: "AWS.SimpleQueueService.ReceiptHandleIsInvalid",
    Message: `The input receipt handle &quot;${receiptHandle}&quot; is not a valid receipt handle.`,
  });

export const ListQueuesResponse = (RequestId: string, queues: any[], token?: string) => {
  let ListQueuesResult = `<ListQueuesResult>\n`;
  ListQueuesResult += queues.map((x) => `<QueueUrl>${x}</QueueUrl>`).join("\n");

  if (token) {
    ListQueuesResult += `<NextToken>${token}</NextToken>\n`;
  }

  ListQueuesResult += "</ListQueuesResult>";
  let body = `${xmlVersion}
    <ListQueuesResponse ${xmlns}>
        ${ListQueuesResult}
        ${ResponseMetadata(RequestId)}
    </ListQueuesResponse> `;

  return body;
};

export const ListQueueTagsResponse = (RequestId: string, tags: any) => {
  let ListQueueTagsResult = "<ListQueueTagsResult>";

  const keys = Object.keys(tags);

  if (keys.length) {
    keys.forEach((k) => {
      ListQueueTagsResult += `<Tag>
      <Key>${k}</Key>
      <Value>${tags[k]}</Value>
   </Tag>`;
    });

    ListQueueTagsResult += "</ListQueueTagsResult>";
  } else {
    ListQueueTagsResult = "<ListQueueTagsResult/>";
  }
  const body = `${xmlVersion}<ListQueueTagsResponse ${xmlns}>
  ${ListQueueTagsResult}
  ${ResponseMetadata(RequestId)}
</ListQueueTagsResponse>`;

  return body;
};

export const TagQueueResponse = (RequestId: string) => {
  return `${xmlVersion}<TagQueueResponse ${xmlns}>
  ${ResponseMetadata(RequestId)}
</TagQueueResponse>`;
};

export const UntagQueueResponse = (RequestId: string) => {
  return `${xmlVersion}<UntagQueueResponse ${xmlns}>
  ${ResponseMetadata(RequestId)}
</UntagQueueResponse>`;
};
export const DeleteQueueResponse = (RequestId: string) => `${xmlVersion}<DeleteQueueResponse ${xmlns}>
${ResponseMetadata(RequestId)}
</DeleteQueueResponse>`;

export const GetQueueUrlResponse = (RequestId: string, port: number, QueueName: string) => `${xmlVersion}<GetQueueUrlResponse ${xmlns}>
  <GetQueueUrlResult>
    <QueueUrl>http://localhost:${port}/123456789012/${QueueName}</QueueUrl>
  </GetQueueUrlResult>
  ${ResponseMetadata(RequestId)}
</GetQueueUrlResponse> `;
