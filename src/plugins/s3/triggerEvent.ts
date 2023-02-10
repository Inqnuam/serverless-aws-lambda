import type { ILambda } from "../../defineConfig";

const eventNames: { [key: string]: [string, string] } = {
  PutObject: ["ObjectCreated", "Put"],
  CopyObject: ["ObjectCreated", "Copy"],
  DeleteObject: ["ObjectRemoved", "Delete"],
};
interface IEventInfo {
  bucket: string;
  eTag: string;
  size: number;
  key: string;
  requestCmd: string;
  sourceIPAddress: string;
  requestId: string;
}

const createRecord = ({ bucket, eTag, size, key, eventName, sourceIPAddress, requestId }: { eventName: string } & Omit<IEventInfo, "requestCmd">) => {
  return {
    eventVersion: "2.1",
    eventSource: "aws:s3",
    awsRegion: "eu-west-3",
    eventTime: new Date().toUTCString(),
    eventName,
    userIdentity: {
      principalId: "AWS:AIDA6ECTW4PP5BZ6IKOGM",
    },
    requestParameters: {
      sourceIPAddress,
    },
    responseElements: {
      "x-amz-request-id": requestId,
      "x-amz-id-2": "K9uTQdtIwO9VVKYvEk0BrLAAO9zWajA33cUGdcrZvjoLHLwBUBocXu1GU50BEcMIfNTLdt2KKmzaagHcGBWncOyUgcXx8UILLYKd26F/pf4=",
    },
    s3: {
      s3SchemaVersion: "1.0",
      configurationId: "975e5867-6fe6-4b2c-925e-ef15389f6d3f",
      bucket: {
        name: bucket,
        ownerIdentity: {
          principalId: "A1HCF0AO1IXCSI",
        },
        arn: `arn:aws:s3:::${bucket}`,
      },
      object: {
        key,
        size,
        eTag,
        sequencer: "0063E38F8ED88A5726",
      },
    },
  };
};

const checkRules = (rules: any, key: string) => {
  if (!rules) {
    return true;
  } else if (Array.isArray(rules)) {
    return rules
      .map((x) => {
        if (typeof x.prefix == "string") {
          return key.startsWith(x.prefix);
        } else if (typeof x.suffix == "string") {
          return key.endsWith(x.suffix);
        } else {
          return false;
        }
      })
      .every((x) => x === true);
  }
};

export const triggerEvent = async (lambdas: ILambda[], { bucket, eTag, size, key, requestCmd, sourceIPAddress, requestId }: IEventInfo) => {
  const event = eventNames[requestCmd];

  for (const l of lambdas) {
    for (const e of l.s3) {
      if (bucket != e.bucket) {
        continue;
      }

      const [one, two] = e.type;

      if (one == event[0] && (two == "*" || two == event[1])) {
        if (checkRules(e.rules, key)) {
          try {
            await l.invoke(
              {
                Records: [createRecord({ bucket, eTag, size, key, sourceIPAddress, requestId, eventName: event.join(":") })],
              },
              {
                kind: "s3",
                event: e,
              }
            );
          } catch (error) {
            console.log(error);
          }
        }
      }
    }
  }
};
