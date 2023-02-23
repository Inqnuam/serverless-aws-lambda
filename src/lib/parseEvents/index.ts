import { LambdaEndpoint } from "../lambdaMock";
import { parseEndpoints } from "./endpoints";
import { parseSns } from "./sns";
import { parseDdbStreamDefinitions } from "./ddbStream";
import { parseS3 } from "./s3";
import { parseKinesis } from "./kinesis";

export const parseEvents = (events: any[], serverless: any, resources: any) => {
  const endpoints: LambdaEndpoint[] = [];
  const sns: any[] = [];
  const ddb: any[] = [];
  const s3: any[] = [];
  const kinesis: any[] = [];
  for (const event of events) {
    const slsEvent = parseEndpoints(event);
    const snsEvent = parseSns(event);
    const ddbStream = parseDdbStreamDefinitions(serverless, resources.ddb, event);
    const s3Event = parseS3(event);
    const kinesisStream = parseKinesis(event, serverless, resources.kinesis);
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
