import { md5 } from "./utils";

const SQS_BATCH_MSG_TOP_LEVEL_KEYS = ["Id", "MessageBody", "DelaySeconds", "MessageDeduplicationId", "MessageGroupId"];

export const parseSqsPublishBody = (encodedBody: string[]) => {
  let body: any = {};

  try {
    let MessageAttribute: any = {};
    let entryMap: any = {};

    let MessageSystemAttribute: any = {};
    let systemEntryMap: any = {};
    for (const s of encodedBody) {
      const [k, v, ...restValues] = s.split("=");
      if (k.startsWith("MessageAttribute")) {
        const [_, entryNumber, entryType, aux] = k.split(".");

        if (entryType == "Name") {
          MessageAttribute[v] = { DataType: "", StringValue: "" };
          entryMap[entryNumber] = v;
        } else if (entryType == "Value") {
          if (aux == "DataType") {
            MessageAttribute[entryMap[entryNumber]].DataType = v;
          } else {
            MessageAttribute[entryMap[entryNumber]].StringValue = v;
          }
        }
      } else if (k.startsWith("MessageSystemAttribute")) {
        const [_, entryNumber, entryType, aux] = k.split(".");

        if (entryType == "Name") {
          MessageSystemAttribute[v] = { DataType: "", StringValue: "" };
          systemEntryMap[entryNumber] = v;
        } else if (entryType == "Value") {
          if (aux == "DataType") {
            MessageSystemAttribute[systemEntryMap[entryNumber]].DataType = v;
          } else {
            MessageSystemAttribute[systemEntryMap[entryNumber]].StringValue = [v, ...restValues].join("=");
          }
        }
      } else {
        body[k] = v;
      }
    }
    if (Object.keys(MessageAttribute).length) {
      body.MessageAttribute = MessageAttribute;
    }

    if (Object.keys(MessageSystemAttribute).length) {
      body.MessageSystemAttribute = MessageSystemAttribute;
    }
  } catch (error) {}

  return body;
};

export const parseSqsPublishBatchBody = (encodedBody: string[]) => {
  let request: any = { Entries: [] };

  try {
    let memberMap = new Map();

    for (const s of encodedBody) {
      const [k, v, ...restValues] = s.split("=");

      if (k.startsWith("SendMessageBatchRequestEntry")) {
        const [, memberNumber, entryType, entryNumber, aux2, aux3] = k.split(".");

        const foundMember = memberMap.get(memberNumber);
        if (foundMember) {
          if (SQS_BATCH_MSG_TOP_LEVEL_KEYS.includes(entryType)) {
            foundMember.value[entryType] = v;
          } else if (entryType == "MessageAttribute" || entryType == "MessageSystemAttribute") {
            const attribName = foundMember[entryType][entryNumber];

            if (attribName) {
              foundMember.value[entryType][attribName][aux3 == "DataType" ? "DataType" : "StringValue"] = v;
            } else {
              foundMember[entryType][entryNumber] = v;

              if (foundMember.value[entryType]) {
                foundMember.value[entryType][v] = {};
              } else {
                foundMember.value[entryType] = {
                  [v]: {},
                };
              }
            }
          }
        } else {
          let content: any = {
            MessageAttribute: {},
            MessageSystemAttribute: {},
            value: {},
          };
          if (entryType == "MessageBody" || entryType == "Id") {
            content.value[entryType] = v;
          } else if (entryType == "MessageAttribute" || entryType == "MessageSystemAttribute") {
            content[entryType][entryNumber] = v;
            content.value[entryType] = {
              [v]: {},
            };
          }

          memberMap.set(memberNumber, content);
        }
      } else {
        request[k] = v;
      }
    }

    for (let v of memberMap.values()) {
      request.Entries.push(v.value);
    }
  } catch (error) {
    console.log(error);
  }
  return request;
};

export const simpleBodyParser = (encodedBody: string[]) => {
  let body: any = {};

  const AttributeNames = [];
  const MessageAttributeNames = [];
  for (const s of encodedBody) {
    const [k, v] = s.split("=");

    if (k.startsWith("AttributeName.")) {
      AttributeNames.push(v);
    } else if (k.startsWith("MessageAttributeName.")) {
      MessageAttributeNames.push(v);
    } else {
      body[k] = v;
    }
  }

  if (AttributeNames.length) {
    body.AttributeNames = AttributeNames;
  }

  if (MessageAttributeNames.length) {
    body.MessageAttributeNames = MessageAttributeNames;
  }

  return body;
};

// https://stackoverflow.com/a/64706045
const SIZE_LENGTH = 4;
const TRANSPORT_FOR_TYPE_STRING_OR_NUMBER = 1;
const transportType1 = ["String", "Number"];

export const parseAttributes = (messageAttributes: any) => {
  let parsedBody: any = {};
  const buffers: any = [];
  const keys = Object.keys(messageAttributes).sort();

  keys.forEach((key) => {
    const { DataType, StringValue } = messageAttributes[key];

    parsedBody[key] = {
      stringValue: StringValue,
      stringListValues: [],
      binaryListValues: [],
      dataType: DataType,
    };

    const nameSize = Buffer.alloc(SIZE_LENGTH);
    nameSize.writeUInt32BE(key.length);

    const name = Buffer.alloc(key.length);
    name.write(key);

    const typeSize = Buffer.alloc(SIZE_LENGTH);
    typeSize.writeUInt32BE(DataType.length);

    const type = Buffer.alloc(DataType.length);
    type.write(DataType);

    const transport = Buffer.alloc(1);

    let valueSize;
    let value;
    if (transportType1.includes(DataType)) {
      transport.writeUInt8(TRANSPORT_FOR_TYPE_STRING_OR_NUMBER);
      valueSize = Buffer.alloc(SIZE_LENGTH);
      valueSize.writeUInt32BE(StringValue.length);

      value = Buffer.alloc(StringValue.length);
      value.write(StringValue);
    } else {
      return console.log("Not implemented: MessageAttributes with type Binary are not supported at the moment.");
    }

    const buffer = Buffer.concat([nameSize, name, typeSize, type, transport, valueSize, value]);

    buffers.push(buffer);
  });

  return {
    md5OfMessageAttributes: md5(Buffer.concat(buffers)),
    messageAttributes: parsedBody,
  };
};

export const parseDottedBody = (encodedBody: string[]) => {
  let body: any = {};
  let nestedValues: any = {};

  for (const s of encodedBody) {
    const [k, v] = s.split("=");

    if (k.includes(".")) {
      const [name, entryNumber, child] = k.split(".");

      const index = Number(entryNumber) - 1;
      if (nestedValues[name]) {
        if (child) {
          if (nestedValues[name][index]) {
            nestedValues[name][index][child] = v;
          } else {
            nestedValues[name].push({
              [child]: v,
            });
          }
        } else {
          nestedValues[name].push(v);
        }
      } else {
        if (child) {
          nestedValues[name] = [
            {
              [child]: v,
            },
          ];
        } else {
          nestedValues[name] = [v];
        }
      }
    } else {
      body[k] = v;
    }
  }
  body = { ...body, ...nestedValues };

  return body;
};