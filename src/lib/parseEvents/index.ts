import type { IS3Event, IDestination } from "../runtime/lambdaMock";
import { LambdaEndpoint } from "../runtime/lambdaMock";
import { parseEndpoints } from "./endpoints";
import { parseSns } from "./sns";
import { parseDdbStreamDefinitions } from "./ddbStream";
import { parseS3 } from "./s3";
import { parseKinesis } from "./kinesis";

export const parseEvents = (events: any[], Outputs: any, resources: any) => {
  const endpoints: LambdaEndpoint[] = [];
  const sns: any[] = [];
  const ddb: any[] = [];
  const s3: any[] = [];
  const kinesis: any[] = [];
  for (const event of events) {
    const slsEvent = parseEndpoints(event);
    const snsEvent = parseSns(Outputs, resources.sns, event);
    const ddbStream = parseDdbStreamDefinitions(Outputs, resources.ddb, event);
    const s3Event = parseS3(event);
    const kinesisStream = parseKinesis(event, Outputs, resources.kinesis);
    if (slsEvent) {
      endpoints.push(slsEvent);
    }
    if (snsEvent) {
      sns.push(snsEvent);
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

  return { ddb, endpoints, s3, sns, kinesis };
};

const supportedServices: IDestination["kind"][] = ["lambda", "sns", "sqs"];
type arn = [string, string, IDestination["kind"], string, string, string, string];

export const parseDestination = (destination: any): IDestination | undefined => {
  if (!destination) {
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
    // TODO: parse destination object
  }
};
