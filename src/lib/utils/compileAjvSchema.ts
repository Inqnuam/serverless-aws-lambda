import Ajv from "ajv";
import ajvFormats from "ajv-formats";

// As Serverless already uses AJV, we use it too to avoid installing and loading other libs
// AJV@8 supports Draft 07 by default, APiG is only Draft 04 compatble and with some limitations.
// https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-known-issues.html#api-gateway-known-issues-rest-apis

const ajv = new Ajv({
  discriminator: false,
  useDefaults: false,
  validateFormats: true,
  jtd: false,
  strictRequired: true,
  allowUnionTypes: true,
  unevaluated: false,
  formats: {
    "date-time": ajvFormats.get("date-time"),
    email: ajvFormats.get("email"),
    hostname: ajvFormats.get("hostname"),
    ipv4: ajvFormats.get("ipv4"),
    ipv6: ajvFormats.get("ipv6"),
    uri: ajvFormats.get("uri"),
  },
});

// Non APiG compatible keywords
ajv.removeKeyword("if");
ajv.removeKeyword("else");
ajv.removeKeyword("then");
ajv.removeKeyword("const");
ajv.removeKeyword("contains");
ajv.removeKeyword("contentEncoding");
ajv.removeKeyword("contentMediaType");
ajv.removeKeyword("contentSchema");
ajv.removeKeyword("nullable");
ajv.removeKeyword("prefixItems");
ajv.removeKeyword("example");
ajv.removeKeyword("examples");
ajv.removeKeyword("deprecated");
ajv.removeKeyword("readOnly");
ajv.removeKeyword("writeOnly");
ajv.removeKeyword("$comment");
ajv.removeKeyword("$defs");
ajv.removeKeyword("exclusiveMinimum");
ajv.removeKeyword("exclusiveMaximum");
ajv.removeKeyword("propertyNames");
ajv.removeKeyword("$id");
ajv.removeKeyword("id");

// some keywords can not be removed directly from AJV as they are used internally

ajv.addKeyword({
  keyword: ["exclusiveMaximum", "exclusiveMinimum"],
  type: ["number"],
  schemaType: ["number"],
  $data: true,
  code(schema: any) {
    if (schema.it.rootId == "http://json-schema.org/draft-07/schema#") {
      return;
    }

    throw new Error(`unsupported keyword "${schema.keyword}"`);
  },
});

ajv.addKeyword({
  keyword: "propertyNames",
  type: ["object"],
  schemaType: ["object", "boolean"],
  code(schema: any) {
    if (schema.it.rootId == "http://json-schema.org/draft-07/schema#") {
      return;
    }

    throw new Error(`unsupported keyword "propertyNames"`);
  },
});

ajv.addKeyword({
  keyword: "$id",
  type: ["object"],
  schemaType: ["string"],
  code(schema: any) {
    if (schema.it.rootId == "http://json-schema.org/draft-07/schema#") {
      return;
    }

    throw new Error(`unsupported keyword "$id"`);
  },
});

ajv.addKeyword({
  keyword: "id",
  schemaType: ["string"],
});

export const compileAjvSchema = (schema: any) => {
  // $schema value is ignored by AWS API Gateway
  // AJV will throw an error if $schema is defined and is not draft-07 (default)

  if (schema && typeof schema == "object" && !Array.isArray(schema)) {
    let schemaAsDraft7;

    if (schema.$schema) {
      schemaAsDraft7 = { ...schema, $schema: "http://json-schema.org/draft-07/schema#" };
    } else {
      schemaAsDraft7 = schema;
    }

    return ajv.compile(schemaAsDraft7);
  } else {
    throw new Error("API Gateway validator Schema must be an object");
  }
};
