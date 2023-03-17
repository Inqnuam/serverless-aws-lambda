import { parseAttributes } from "./parser";
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

  const body = `<?xml version="1.0"?><SendMessageResponse xmlns="http://queue.amazonaws.com/doc/2012-11-05/">
      <SendMessageResult>
         ${SendMessageResult}
      </SendMessageResult>
      <ResponseMetadata>
          <RequestId>${RequestId}</RequestId>
      </ResponseMetadata>
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

  const body = `<?xml version="1.0"?><SendMessageBatchResponse xmlns="http://queue.amazonaws.com/doc/2012-11-05/">
      <SendMessageBatchResult>
          ${SendMessageBatchResult}
      </SendMessageBatchResult>
      <ResponseMetadata>
          <RequestId>${RequestId}</RequestId>
      </ResponseMetadata>
      </SendMessageBatchResponse>`;
  return body;
};

export const PurgeQueueResponse = (RequestId: string) => {
  return `<?xml version="1.0"?><PurgeQueueResponse xmlns="http://queue.amazonaws.com/doc/2012-11-05/">
  <ResponseMetadata>
  <RequestId>${RequestId}</RequestId>
  </ResponseMetadata>
  </PurgeQueueResponse>`;
};

export const PurgeQueueErrorResponse = (RequestId: string, queueName: string) => {
  return `<?xml version="1.0"?>
      <ErrorResponse xmlns="http://queue.amazonaws.com/doc/2012-11-05/">
        <Error>
          <Type>Sender</Type>
          <Code>AWS.SimpleQueueService.PurgeQueueInProgress</Code>
          <Message>Only one PurgeQueue operation on ${queueName} is allowed every 60 seconds.</Message>
          <Detail/>
        </Error>
        <RequestId>${RequestId}</RequestId>
      </ErrorResponse>`;
};

export const queueNotFound = (RequestId: string) => {
  return `<?xml version="1.0"?>
    <ErrorResponse xmlns="http://queue.amazonaws.com/doc/2012-11-05/">
      <Error>
        <Type>Sender</Type>
        <Code>AWS.SimpleQueueService.NonExistentQueue</Code>
        <Message>The specified queue does not exist for this wsdl version.</Message>
        <Detail/>
      </Error>
      <RequestId>${RequestId}</RequestId>
    </ErrorResponse>`;
};

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

  const body = `<?xml version="1.0"?>
  <ReceiveMessageResponse xmlns="http://queue.amazonaws.com/doc/2012-11-05/">
     ${ReceiveMessageResult}  
    <ResponseMetadata>
      <RequestId>${RequestId}</RequestId>
    </ResponseMetadata>
  </ReceiveMessageResponse>`;

  return body;
};

export const ChangeMessageVisibilityResponse = (RequestId: string) => `<?xml version="1.0"?><ChangeMessageVisibilityResponse>
    <ResponseMetadata>
        <RequestId>${RequestId}</RequestId>
    </ResponseMetadata>
  </ChangeMessageVisibilityResponse>`;

export const ChangeMessageVisibilityError = (RequestId: string, receiptHandle: string) => `<?xml version="1.0"?>
  <ErrorResponse xmlns="http://queue.amazonaws.com/doc/2012-11-05/">
      <Error>
          <Type>Sender</Type>
          <Code>InvalidParameterValue</Code>
          <Message>Value &quot;${receiptHandle}&quot; for parameter ReceiptHandle is invalid. Reason: Message does not exist or is not available for visibility timeout change.</Message>
          <Detail/>
      </Error>
      <RequestId>${RequestId}</RequestId>
  </ErrorResponse>`;

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

  const body = `<?xml version="1.0"?><ChangeMessageVisibilityBatchResponse xmlns="http://queue.amazonaws.com/doc/2012-11-05/">
    <ChangeMessageVisibilityBatchResult>
        ${succeed}
        ${fails}
    </ChangeMessageVisibilityBatchResult>
    <ResponseMetadata>
        <RequestId>${RequestId}</RequestId>
    </ResponseMetadata>
</ChangeMessageVisibilityBatchResponse>`;

  return body;
};

export const EmptyBatchRequest = (RequestId: string) => `<?xml version="1.0"?>
<ErrorResponse xmlns="http://queue.amazonaws.com/doc/2012-11-05/">
    <Error>
        <Type>Sender</Type>
        <Code>MissingParameter</Code>
        <Message>The request must contain the parameter ChangeMessageVisibilityBatchRequestEntry.1.Id.</Message>
        <Detail/>
    </Error>
    <RequestId>${RequestId}</RequestId>
</ErrorResponse>
`;

export const TooManyEntriesInBatchRequest = (RequestId: string, entryLenght: number) => `<?xml version="1.0"?>
<ErrorResponse xmlns="http://queue.amazonaws.com/doc/2012-11-05/">
    <Error>
        <Type>Sender</Type>
        <Code>AWS.SimpleQueueService.TooManyEntriesInBatchRequest</Code>
        <Message>Maximum number of entries per request are 10. You have sent ${entryLenght}.</Message>
        <Detail/>
    </Error>
    <RequestId>${RequestId}</RequestId>
</ErrorResponse>`;

export const BatchEntryIdsNotDistinct = (RequestId: string, repetedId: string) => `<?xml version="1.0"?>
<ErrorResponse xmlns="http://queue.amazonaws.com/doc/2012-11-05/">
    <Error>
        <Type>Sender</Type>
        <Code>AWS.SimpleQueueService.BatchEntryIdsNotDistinct</Code>
        <Message>Id ${repetedId} repeated.</Message>
        <Detail/>
    </Error>
    <RequestId>${RequestId}</RequestId>
</ErrorResponse>`;

export const InvalidBatchEntryId = (RequestId: string) => `<?xml version="1.0"?>
<ErrorResponse xmlns="http://queue.amazonaws.com/doc/2012-11-05/">
    <Error>
        <Type>Sender</Type>
        <Code>AWS.SimpleQueueService.InvalidBatchEntryId</Code>
        <Message>A batch entry id can only contain alphanumeric characters, hyphens and underscores. It can be at most 80 letters long.</Message>
        <Detail/>
    </Error>
    <RequestId>${RequestId}</RequestId>
</ErrorResponse>`;

export const DeleteMessageResponse = (RequestId: string) => `<?xml version="1.0"?><DeleteMessageResponse xmlns="http://queue.amazonaws.com/doc/2012-11-05/">
<ResponseMetadata>
<RequestId>${RequestId}</RequestId>
</ResponseMetadata>
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

  const body = `<?xml version="1.0"?>
  <DeleteMessageBatchResponse xmlns="http://queue.amazonaws.com/doc/2012-11-05/">
      <DeleteMessageBatchResult>
        ${succeed}
        ${fails}
      </DeleteMessageBatchResult>
      <ResponseMetadata>
        <RequestId>${RequestId}</RequestId>
      </ResponseMetadata>
  </DeleteMessageBatchResponse>`;

  return body;
};

export const ReceiptHandleIsInvalid = (RequestId: string, receiptHandle: string) => `<?xml version="1.0"?><ErrorResponse xmlns="http://queue.amazonaws.com/doc/2012-11-05/">
<Error>
    <Type>Sender</Type>
    <Code>AWS.SimpleQueueService.ReceiptHandleIsInvalid</Code>
    <Message>The input receipt handle &quot;${receiptHandle}&quot; is not a valid receipt handle.</Message>
    <Detail/>
</Error>
<RequestId>${RequestId}</RequestId>
</ErrorResponse>`;

export const ListQueuesResponse = (RequestId: string, queues: any[], token?: string) => {
  let ListQueuesResult = `<ListQueuesResult>\n`;
  ListQueuesResult += queues.map((x) => `<QueueUrl>${x}</QueueUrl>`).join("\n");

  if (token) {
    ListQueuesResult += `<NextToken>${token}</NextToken>\n`;
  }

  ListQueuesResult += "</ListQueuesResult>";
  let body = `<?xml version="1.0"?>
    <ListQueuesResponse xmlns="http://queue.amazonaws.com/doc/2012-11-05/">
        ${ListQueuesResult}
        <ResponseMetadata>
            <RequestId>${RequestId}</RequestId>
        </ResponseMetadata>
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
  const body = `<?xml version="1.0"?><ListQueueTagsResponse xmlns="http://queue.amazonaws.com/doc/2012-11-05/">
  ${ListQueueTagsResult}
  <ResponseMetadata>
    <RequestId>${RequestId}</RequestId>
  </ResponseMetadata>
</ListQueueTagsResponse>`;

  return body;
};

export const TagQueueResponse = (RequestId: string) => {
  return `<?xml version="1.0"?><TagQueueResponse xmlns="http://queue.amazonaws.com/doc/2012-11-05/">
  <ResponseMetadata>
    <RequestId>${RequestId}</RequestId>
  </ResponseMetadata>
</TagQueueResponse>`;
};

export const UntagQueueResponse = (RequestId: string) => {
  return `<?xml version="1.0"?><UntagQueueResponse xmlns="http://queue.amazonaws.com/doc/2012-11-05/">
  <ResponseMetadata>
    <RequestId>${RequestId}</RequestId>
  </ResponseMetadata>
</UntagQueueResponse>`;
};
export const DeleteQueueResponse = (RequestId: string) => {
  return `<?xml version="1.0"?><DeleteQueueResponse xmlns="http://queue.amazonaws.com/doc/2012-11-05/">
  <ResponseMetadata>
    <RequestId>${RequestId}</RequestId>
  </ResponseMetadata>
</DeleteQueueResponse>`;
};
