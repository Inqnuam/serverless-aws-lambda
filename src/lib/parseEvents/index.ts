import { LambdaEndpoint } from "../lambdaMock";
import { parseEndpoints } from "./endpoints";
import { parseSns } from "./sns";
import { parseDdbStreamDefinitions, getDynamoStreamTables } from "./ddbStream";
import { parseS3 } from "./s3";

export const parseEvents = (events: any[], serverless: any) => {
  const endpoints: LambdaEndpoint[] = [];
  const sns: any[] = [];
  const ddb: any[] = [];
  const s3: any[] = [];

  const ddbStreamTables = getDynamoStreamTables(serverless);
  for (const event of events) {
    const slsEvent = parseEndpoints(event);
    const snsEvent = parseSns(event);
    const ddbSteam = parseDdbStreamDefinitions(serverless, ddbStreamTables, event);
    const s3Event = parseS3(event);
    if (slsEvent) {
      endpoints.push(slsEvent);
    }
    if (snsEvent) {
      sns.push(snsEvent);
    }

    if (ddbSteam) {
      ddb.push(ddbSteam);
    }

    // @ts-ignore
    if (s3Event) {
      s3.push(s3Event);
    }
  }

  return { ddb, endpoints, s3, sns };
};
