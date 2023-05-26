const tBool = { type: "boolean" };
const tString = { type: "string" };
const tArrayString = { type: "array", uniqueItems: true, items: tString };
const tBoolOrStrings = { anyOf: [tBool, tString, tArrayString] };

const tWithAlias = {
  type: "object",
  additionalProperties: false,
  required: ["at", "as"],
  properties: {
    at: tString,
    as: tString,
  },
};

const tPattern = {
  type: "object",
  additionalProperties: false,
  required: ["pattern"],
  properties: {
    pattern: tString,
    dir: tString,
  },
};

const tFromText = {
  type: "object",
  additionalProperties: false,
  required: ["text", "to"],
  properties: {
    text: tString,
    to: tString,
  },
};

const tFiles = {
  type: "array",
  uniqueItems: true,
  items: {
    anyOf: [tString, tWithAlias, tPattern, tFromText],
  },
};

const funcExtendedProps = {
  properties: {
    virtualEnvs: { type: "object" },
    online: tBoolOrStrings,
  },
};
const patchSchema = (serverless: any) => {
  serverless.configSchemaHandler.defineFunctionProperties("aws", funcExtendedProps);

  const schemaProps = serverless.configSchemaHandler.schema.properties;

  const pkg = { ...schemaProps.package };
  pkg.properties = { ...pkg.properties };
  pkg.properties.preserveDir = tBool;
  pkg.properties.files = tFiles;
  pkg.properties.assets = tBoolOrStrings;

  schemaProps.package = pkg;

  const funcPkg = schemaProps.functions.patternProperties["^[a-zA-Z0-9-_]+$"].properties.package.properties;
  funcPkg.preserveDir = tBool;
  funcPkg.files = tFiles;
  funcPkg.inheritFiles = tBool;
  funcPkg.assets = tBoolOrStrings;
};
export { patchSchema };
