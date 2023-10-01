import { log } from "../../lib/utils/colorize";
import type { ILambda } from "../../defineConfig";
import { randomUUID } from "crypto";
import { filterObject } from "./filter";
import { SnsError } from "./errors";

export interface FailedMessage {
  Id: string;
  SenderFault: boolean;
  Code: string;
  Message: string;
}

const VALIDE_DATA_TYPES = new Set(["Binary", "Number", "String"]);

export const parseSnsPublishBody = (encodedBody: string[]) => {
  let body: any = {};

  let MessageAttributes: any = {};
  let entryMap: any = {};
  const alreadySet: Set<string> = new Set([]);

  for (const s of encodedBody) {
    const [k, v, ...restValues] = s.split("=");
    if (k.startsWith("MessageAttributes")) {
      const [_, __, entryNumber, entryType, aux] = k.split(".");

      if (entryType == "Name") {
        MessageAttributes[v] = { Type: "", Value: "" };
        entryMap[entryNumber] = v;
      } else if (entryType == "Value") {
        if (aux == "DataType") {
          MessageAttributes[entryMap[entryNumber]].Type = v;
        } else {
          const attribName = entryMap[entryNumber] as string;

          if (alreadySet.has(attribName)) {
            throw new SnsError({
              Code: "ParameterValueInvalid",
              Message: `Message attribute name '${attribName}' has multiple values.`,
            });
          }

          const val = [v, ...restValues].join("=");
          const Type = MessageAttributes[attribName].Type;

          if (val) {
            // if value is not empty
            if (Type == "Binary" && aux == "StringValue") {
              throw new SnsError({
                Code: "ParameterValueInvalid",
                Message: `The message attribute '${attribName}' with type 'Binary' must use field 'Binary'.`,
              });
            }

            if ((Type == "String" || Type == "Number") && aux == "BinaryValue") {
              throw new SnsError({
                Code: "ParameterValueInvalid",
                Message: `The message attribute '${attribName}' with type '${Type}' must use field 'String'.`,
              });
            }
          }

          MessageAttributes[attribName].Value = val;
          alreadySet.add(attribName);
        }
      }
    } else {
      body[k] = [v, ...restValues].join("=");
    }
  }
  if (Object.keys(MessageAttributes).length) {
    validateMessageAttributes(MessageAttributes);
    body.MessageAttributes = MessageAttributes;
  }

  return body;
};

const validatePublishBatchBody = (Ids: string[]) => {
  for (const id of Ids) {
    if (Ids.filter((x) => x == id).length > 1) {
      throw new SnsError({ Code: "BatchEntryIdsNotDistinct", Message: "Two or more batch entries in the request have the same Id." });
    }
  }
};

const validateMessageAttributes = (MessageAttributes: Record<string, any>) => {
  for (const [attribName, v] of Object.entries(MessageAttributes)) {
    const { Type, Value } = v as any;

    if (!VALIDE_DATA_TYPES.has(Type)) {
      throw new SnsError({
        Code: "ParameterValueInvalid",
        Message: `The message attribute '${attribName}' has an invalid message attribute type, the set of supported type prefixes is Binary, Number, and String.`,
      });
    }

    if ((Type == "String" || Type == "Number") && !Value) {
      throw new SnsError({
        Code: "ParameterValueInvalid",
        Message: `The message attribute '${attribName}' must contain non-empty message attribute value for message attribute type '${Type}'.`,
      });
    }

    if (Type == "Number" && isNaN(Value)) {
      throw new SnsError({
        Code: "ParameterValueInvalid",
        Message: `Could not cast message attribute '${attribName}' value to number.`,
      });
    }
  }
};

export const parseSnsPublishBatchBody = (encodedBody: string[]) => {
  let body: any = {};
  let Ids = [];
  const uid = randomUUID();
  const Records = [];
  const Failed: FailedMessage[] = [];

  const memberMap = new Map();
  const alreadySet: Set<string> = new Set([]);

  for (const s of encodedBody) {
    const [k, v] = s.split("=");

    if (k.startsWith("PublishBatchRequestEntries")) {
      const [, , memberNumber, entryType, aux, entryNumber, aux2, aux3] = k.split(".");

      const foundMember = memberMap.get(memberNumber);
      if (foundMember) {
        if (entryType == "Message" || entryType == "MessageStructure" || entryType == "Subject" || entryType == "Id") {
          foundMember.value[entryType] = v;
        } else if (entryType == "MessageAttributes") {
          const attribName = foundMember.attributes[entryNumber];
          if (attribName) {
            if (aux3 == "DataType") {
              foundMember.value.MessageAttributes[attribName].Type = v;
            } else {
              // Validate value
              const indexedAttribName = `${memberNumber}-${attribName}`;

              if (alreadySet.has(indexedAttribName)) {
                throw new SnsError({
                  Code: "ParameterValueInvalid",
                  Message: `Message attribute name '${attribName}' has multiple values.`,
                });
              }
              const [, ...values] = s.split("=");
              const val = values.join("=");
              const Type = foundMember.value.MessageAttributes[attribName].Type;

              if (val) {
                // if value is not empty
                if (Type == "Binary" && aux3 == "StringValue") {
                  throw new SnsError({
                    Code: "ParameterValueInvalid",
                    Message: `The message attribute '${attribName}' with type 'Binary' must use field 'Binary'.`,
                  });
                }

                if ((Type == "String" || Type == "Number") && aux3 == "BinaryValue") {
                  throw new SnsError({
                    Code: "ParameterValueInvalid",
                    Message: `The message attribute '${attribName}' with type '${Type}' must use field 'String'.`,
                  });
                }
              }

              foundMember.value.MessageAttributes[attribName].Value = val;
              alreadySet.add(indexedAttribName);
            }
          } else {
            foundMember.attributes[entryNumber] = v;

            if (foundMember.value.MessageAttributes) {
              foundMember.value.MessageAttributes[v] = {};
            } else {
              foundMember.value.MessageAttributes = {
                [v]: {},
              };
            }
          }
        }
      } else {
        let content: any = {
          attributes: {},
          value: {},
        };
        if (entryType == "Message" || entryType == "MessageStructure" || entryType == "Subject" || entryType == "Id") {
          content.value[entryType] = v;
        } else if (entryType == "MessageAttributes") {
          content.attributes[entryNumber] = v;
          content.value.MessageAttributes = {
            [v]: {},
          };
        }

        memberMap.set(memberNumber, content);
      }
    } else {
      body[k] = v;
    }
  }

  for (const v of memberMap.values()) {
    const Sns: any = {
      Type: "Notification",
      MessageId: randomUUID(),
      TopicArn: body.TopicArn,
      Subject: v.value.Subject ?? null,
      Timestamp: new Date().toISOString(),
      SignatureVersion: "1",
      Signature: "fake",
      SigningCertUrl: "fake",
      UnsubscribeUrl: "fake",
      MessageStructure: v.value.MessageStructure,
    };

    if ("Message" in v.value) {
      Sns.Message = v.value.Message;
    }

    if (v.value.MessageAttributes) {
      Sns.MessageAttributes = v.value.MessageAttributes;
    }
    const e = { EventSource: "aws:sns", EventVersion: "1.0", EventSubscriptionArn: `${body.TopicArn}:${uid}`, Sns };

    try {
      validatePublishMessage(Sns);

      delete Sns.MessageStructure;
      Records.push(e);
    } catch (error) {
      if (error instanceof SnsError) {
        Failed.push({ Id: v.value.Id, Code: error.Code, SenderFault: error.SenderFault, Message: error.message });
      }
    } finally {
      Ids.push(v.value.Id);
    }
  }
  validatePublishBatchBody(Ids);

  Records.forEach((r) => {
    if (r.Sns.MessageAttributes) {
      validateMessageAttributes(r.Sns.MessageAttributes);
    }
  });

  return { Records, Ids, Failed };
};

const validatePublishMessage = (body: any) => {
  if (!("Message" in body)) {
    throw new SnsError({ Code: "ValidationError", Message: "1 validation error detected: Value null at 'message' failed to satisfy constraint: Member must not be null" });
  }

  if (body.Message == "") {
    throw new SnsError({ Code: "InvalidParameter", Message: "Invalid parameter: Empty message" });
  }

  if (body.MessageStructure == "json") {
    try {
      body.Message = JSON.parse(body.Message);
    } catch (error) {
      throw new SnsError({ Code: "InvalidParameter", Message: "Invalid parameter: Message Structure - Failed to parse JSON" });
    }

    const tMsgDefault = typeof body.Message.default;
    if (tMsgDefault == "number" || tMsgDefault == "boolean" || body.Message.default === null) {
      body.Message = String(body.Message.default);
    } else if (tMsgDefault == "string") {
      body.Message = body.Message.default;
    } else {
      throw new SnsError({ Code: "InvalidParameter", Message: "Invalid parameter: Message Structure - No default entry in JSON message body" });
    }
  }
};

export const createSnsTopicEvent = (body: any, MessageId: string) => {
  validatePublishMessage(body);

  return {
    Records: [
      {
        EventSource: "aws:sns",
        EventVersion: "1.0",
        EventSubscriptionArn: body.TopicArn,
        Sns: {
          Type: "Notification",
          MessageId,
          TopicArn: body.TopicArn,
          Subject: body.Subject ?? null,
          Message: body.Message,
          Timestamp: new Date().toISOString(),
          SignatureVersion: "1",
          Signature: "fake",
          SigningCertUrl: "fake",
          UnsubscribeUrl: "fake",
          MessageAttributes: body.MessageAttributes,
        },
      },
    ],
  };
};
export const getHandlersByTopicArn = (body: any, handlers: ILambda[]) => {
  const arnComponent = body.TopicArn.split(":");
  const name = arnComponent[arnComponent.length - 1];

  const foundHandlers: { handler: ILambda; event: any }[] = [];

  handlers.forEach((x) => {
    const streamEvent: any = x.sns.find((foundEvent) => {
      if (!foundEvent || foundEvent.name !== name) {
        return false;
      }

      if (!foundEvent.filter) {
        return true;
      }

      let filterContext: any = {};

      if (foundEvent.filterScope == "MessageAttributes") {
        if (!body.MessageAttributes) {
          return false;
        }

        for (const [k, v] of Object.entries(body.MessageAttributes)) {
          filterContext[k] = (v as any).Value;
        }
      } else if (foundEvent.filterScope == "MessageBody") {
        if (body.MessageStructure != "json" || !body.Message) {
          return false;
        }
        try {
          filterContext = JSON.parse(body.Message);
        } catch (error) {}
      }

      return filterObject(foundEvent.filter, filterContext);
    });

    if (streamEvent) {
      foundHandlers.push({
        handler: x,
        event: streamEvent,
      });
    }
  });

  return foundHandlers;
};

export const genSnsPublishResponse = (MessageId: string, RequestId: string) => {
  return `<PublishResponse xmlns="http://sns.amazonaws.com/doc/2010-03-31/">
      <PublishResult>
        <MessageId>${MessageId}</MessageId>
      </PublishResult>
      <ResponseMetadata>
        <RequestId>${RequestId}</RequestId>
      </ResponseMetadata>
    </PublishResponse>`;
};

export const genSnsPublishBatchResponse = (RequestId: string, Successful: any[], Failed: FailedMessage[]) => {
  let successContent = "<Successful/>";
  let failedContent = "<Failed/>";

  if (Successful.length) {
    const content = Successful.map(
      (x) => `<member>
    <MessageId>${x.MessageId}</MessageId>
    <Id>${x.Id}</Id>
  </member>`
    ).join("\n");

    successContent = `<Successful>
  ${content}
  </Successful>`;
  }

  if (Failed.length) {
    const content = Failed.map(
      (x) => `<member>
      <Code>${x.Code}</Code>
      <SenderFault>${x.SenderFault}</SenderFault>
      <Id>${x.Id}</Id>
      <Message>${x.Message}</Message>
  </member>`
    ).join("\n");

    failedContent = `<Failed>
  ${content}
  </Failed>`;
  }
  return `<PublishBatchResponse xmlns="http://sns.amazonaws.com/doc/2010-03-31/">
      <PublishBatchResult>
        ${failedContent}
        ${successContent}
      </PublishBatchResult>
      <ResponseMetadata>
        <RequestId>${RequestId}</RequestId>
      </ResponseMetadata>
    </PublishBatchResponse>`;
};
