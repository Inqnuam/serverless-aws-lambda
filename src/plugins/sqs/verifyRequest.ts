import { SqsError } from "./errors";

export const verifyMessageBody = (MessageBody: string) => {
  if (!MessageBody) {
    // if doesnt exists or is an empty string
    throw new SqsError({ Code: "MissingParameter", Message: "The request must contain the parameter MessageBody." });
  }
};
const VALIDE_DATA_TYPES = ["String", "Number", "Binary"];
const VALIDE_SYSTEM_ATTRIBUTES = ["AWSTraceHeader"];

const verifyAWSTraceHeader = (TraceAttribute: Record<string, any>) => {
  if (TraceAttribute.DataType != "String") {
    throw new SqsError({
      Code: "InvalidParameterValue",
      Message: `The message system attribute 'AWSTraceHeader' is reserved for AWS X-Ray trace header. The type must be 'String'.`,
    });
  }

  if (!TraceAttribute.StringValue.includes("=")) {
    throw new SqsError({
      Code: "InvalidParameterValue",
      Message: `The message system attribute 'AWSTraceHeader' is reserved for AWS X-Ray trace header. Value '${TraceAttribute.StringValue}' is invalid.`,
    });
  }
};

export const verifyMessageAttributes = (MessageAttributes: Record<string, any>, messageAttributesType: "(user)" | "system" = "(user)") => {
  for (const [attribName, v] of Object.entries(MessageAttributes)) {
    const keys = Object.keys(v);
    if (!keys.length) {
      throw new SqsError({
        Code: "InvalidParameterValue",
        Message: `The message ${messageAttributesType} attribute '${attribName}' must contain a non-empty message attribute value.`,
      });
    }

    if (!keys.includes("DataType")) {
      throw new SqsError({
        Code: "InvalidParameterValue",
        Message: `The message ${messageAttributesType} attribute '${attribName}' must contain a non-empty message attribute type.`,
      });
    }

    if (!VALIDE_DATA_TYPES.includes(v.DataType)) {
      throw new SqsError({
        Code: "InvalidParameterValue",
        Message: `The type of message ${messageAttributesType} attribute '${attribName}' is invalid. You must use only the following supported type prefixes: Binary, Number, String.`,
      });
    }

    if ((keys.includes("StringValue") && v.StringValue == "") || (keys.includes("BinaryValue") && v.BinaryValue == "")) {
      throw new SqsError({
        Code: "InvalidParameterValue",
        Message: `Message ${messageAttributesType} attribute '${attribName}' must contain a non-empty value of type '${v.DataType}'.`,
      });
    }

    if (keys.length == 1) {
      throw new SqsError({
        Code: "InvalidParameterValue",
        Message: `Message ${messageAttributesType} attribute '${attribName}' must contain a non-empty value of type '${v.DataType}'.`,
      });
    }

    if (keys.length > 2) {
      throw new SqsError({ Code: "InvalidParameterValue", Message: `Message ${messageAttributesType} attribute '${attribName}' must have a single value.` });
    }

    if ((v.DataType == "String" || v.DataType == "Number") && !v.StringValue) {
      throw new SqsError({
        Code: "InvalidParameterValue",
        Message: `Message ${messageAttributesType} attribute '${attribName}' with type '${v.DataType}' must use field 'String'.`,
      });
    }
    if (v.DataType == "Binary" && !v.BinaryValue) {
      throw new SqsError({ Code: "InvalidParameterValue", Message: `Message ${messageAttributesType} attribute '${attribName}' with type 'Binary' must use field 'Binary'.` });
    }

    if (v.DataType == "Number" && isNaN(v.StringValue)) {
      throw new SqsError({ Code: "InvalidParameterValue", Message: `Can't cast the value of message ${messageAttributesType} attribute '${attribName}' to a number.` });
    }
  }

  if (messageAttributesType == "system") {
    const foundInvalidAttribute = Object.keys(MessageAttributes).find((x) => !VALIDE_SYSTEM_ATTRIBUTES.includes(x));

    if (foundInvalidAttribute) {
      throw new SqsError({ Code: "InvalidParameterValue", Message: `Message system attribute name '${foundInvalidAttribute}' is invalid.` });
    }

    verifyAWSTraceHeader(MessageAttributes.AWSTraceHeader);
  }
};
