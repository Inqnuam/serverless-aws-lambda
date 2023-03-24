import type { LambdaEndpoint } from "./endpoints";
import { parseEndpoints } from "./endpoints";
import { parseSns } from "./sns";
import { parseDdbStreamDefinitions } from "./ddbStream";
import { parseS3 } from "./s3";
import { parseKinesis } from "./kinesis";
import { parseSqs } from "./sqs";

const supportedServices: IDestination["kind"][] = ["lambda", "sns", "sqs"];
type arn = [string, string, IDestination["kind"], string, string, string, string];
export interface IDestination {
  kind: "lambda" | "sns" | "sqs";
  name: string;
}
export const parseEvents = (events: any[], Outputs: any, resources: any) => {
  const endpoints: LambdaEndpoint[] = [];
  const sns: any[] = [];
  const sqs: any[] = [];
  const ddb: any[] = [];
  const s3: any[] = [];
  const kinesis: any[] = [];
  for (const event of events) {
    const slsEvent = parseEndpoints(event);
    const snsEvent = parseSns(Outputs, resources, event);
    const sqsEvent = parseSqs(Outputs, resources, event);
    const ddbStream = parseDdbStreamDefinitions(Outputs, resources, event);
    const s3Event = parseS3(event);
    const kinesisStream = parseKinesis(event, Outputs, resources);
    if (slsEvent) {
      endpoints.push(slsEvent);
    }
    if (snsEvent) {
      sns.push(snsEvent);
    }

    if (sqsEvent) {
      sqs.push(sqsEvent);
    }

    if (ddbStream) {
      ddb.push(ddbStream);
    }

    if (s3Event) {
      s3.push(s3Event);
    }
    if (kinesisStream) {
      kinesis.push(kinesisStream);
    }
  }

  return { ddb, endpoints, s3, sns, sqs, kinesis };
};

export const parseDestination = (destination: any, Outputs: any, resources: any): IDestination | undefined => {
  if (!destination || (destination.type && !supportedServices.includes(destination.type))) {
    return;
  }
  if (typeof destination == "string") {
    if (destination.startsWith("arn:")) {
      const [, , kind, region, accountId, name, aux] = destination.split(":") as arn;

      if (supportedServices.includes(kind)) {
        return {
          kind,
          name: name == "function" ? aux : name,
        };
      }
    } else {
      return {
        kind: "lambda",
        name: destination,
      };
    }
  } else {
    let dest: any = {};

    if (typeof destination.arn == "string") {
      const [, , kind, region, accountId, name, aux] = destination.arn.split(":") as arn;
      dest.name = name;

      if (supportedServices.includes(kind)) {
        dest.kind = kind;
      }
    } else if (supportedServices.includes(destination.type) && destination.arn) {
      dest.kind = destination.type;

      const [key, value] = Object.entries(destination.arn)?.[0];

      if (!key || !value) {
        return;
      }

      if (key == "Fn::GetAtt" || key == "Ref") {
        const [resourceName] = value as unknown as any[];

        const resource = resources?.[dest.kind]?.[resourceName];
        if (resource) {
          const resourceName = resource[dest.kind == "sns" ? "TopicName" : "QueueName"];
          if (typeof resourceName == "string") {
            dest.name = resourceName;
          }
        }
      } else if (key == "Fn::ImportValue" && typeof value == "string") {
        const exportedName = Outputs?.[value]?.Export?.Name;
        if (typeof exportedName == "string") {
          dest.name = exportedName;
        }
      }
    }

    if (dest.kind && dest.name) {
      return dest;
    }
  }
};
