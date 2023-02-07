import { LambdaEndpoint } from "../lambdaMock";
import { parseEndpoints } from "./endpoints";
import { parseSns } from "./sns";
import { parseDdbStreamDefinitions, getDynamoStreamTables } from "./ddbStream";

export const parseEvents = (events: any[], serverless: any) => {
  const endpoints: LambdaEndpoint[] = [];
  const sns: any[] = [];
  const ddb: any[] = [];

  const ddbStreamTables = getDynamoStreamTables(serverless);
  for (const event of events) {
    const slsEvent = parseEndpoints(event);
    const snsEvent = parseSns(event);
    const ddbSteam = parseDdbStreamDefinitions(serverless, ddbStreamTables, event);
    if (slsEvent) {
      endpoints.push(slsEvent);
    }
    if (snsEvent) {
      sns.push(snsEvent);
    }

    if (ddbSteam) {
      ddb.push(ddbSteam);
    }
  }

  return { endpoints, sns, ddb };
};
