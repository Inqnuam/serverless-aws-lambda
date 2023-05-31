import { log } from "../../lib/utils/colorize";
import type { ILambda } from "../../defineConfig";
import { randomUUID } from "crypto";
import { filterObject } from "./filter";

export const parseSnsPublishBody = (encodedBody: string[]) => {
  let body: any = {};

  try {
    let MessageAttributes: any = {};
    let entryMap: any = {};
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
            MessageAttributes[entryMap[entryNumber]].Value = [v, ...restValues].join("=");
          }
        }
      } else {
        body[k] = [v, ...restValues].join("=");
      }
    }
    if (Object.keys(MessageAttributes).length) {
      body.MessageAttributes = MessageAttributes;
    }
  } catch (error) {}

  if (body.MessageStructure == "json") {
    try {
      const parsedPsg = JSON.parse(body.Message);
      body.Message = parsedPsg.default;
    } catch (error) {
      throw new Error("Invalid body message");
    }
  }

  return body;
};

export const parseSnsPublishBatchBody = (encodedBody: string[]) => {
  let body: any = {};
  let Ids = [];
  const uid = randomUUID();
  const Records = [];
  try {
    let memberMap = new Map();

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
              foundMember.value.MessageAttributes[attribName][aux3 == "DataType" ? "Type" : "Value"] = v;
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
      let Sns: any = {
        Type: "Notification",
        MessageId: randomUUID(),
        TopicArn: body.TopicArn,
        Subject: v.value.Subject ?? null,
        Message: v.value.Message,
        Timestamp: new Date().toISOString(),
        SignatureVersion: "1",
        Signature: "fake",
        SigningCertUrl: "fake",
        UnsubscribeUrl: "fake",
      };

      if (Object.keys(v.value.MessageAttributes).length) {
        Sns.MessageAttributes = v.value.MessageAttributes;
      }

      if (v.value.MessageStructure == "json") {
        try {
          Sns.Message = JSON.parse(v.value.Message).default;
        } catch (error) {
          log.RED("Can't parse SNS message json body");
        }
      }
      const e = { EventSource: "aws:sns", EventVersion: "1.0", EventSubscriptionArn: `${body.TopicArn}:${uid}`, Sns };

      Ids.push(v.value.Id);
      Records.push(e);
    }
  } catch (error) {
    console.log(error);
  }

  return { Records, Ids };
};
export const createSnsTopicEvent = (body: any, MessageId: string) => {
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

export const genSnsPublishBatchResponse = (RequestId: string, Successful: any[], Failed: any[]) => {
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
    const content = Successful.map(
      (x) => `<member>
    <MessageId>${x.MessageId}</MessageId>
    <Id>${x.Id}</Id>
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
