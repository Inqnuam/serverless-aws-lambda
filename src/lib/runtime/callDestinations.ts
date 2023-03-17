import http from "http";
import type { IDestination } from "./lambdaMock";

interface ICallDestination {
  destination: IDestination;
  LOCAL_PORT: string;
  event: any;
  payload: any;
  requestId: string;
  lambdaName: string;
}
interface ISnsPayloadParams {
  topicName: string;
  event: any;
  payload: any;
  requestId: string;
  success: boolean;
  lambdaName: string;
}

type IGenResponse = Omit<ICallDestination, "LOCAL_PORT"> & { success: boolean };

const getDestinationPathname = (destination: IDestination) => {
  switch (destination.kind) {
    case "sns":
      return "@sns/parsed/";
    case "sqs":
      return "@sqs";
    case "lambda":
      return `@invoke/${destination.name}/`;
    default:
      break;
  }
};

const genRequest = (port: string, destination: IDestination) => {
  const pathname = getDestinationPathname(destination);

  if (!pathname) {
    return;
  }

  const headers = {
    "Content-Type": destination.kind == "sqs" ? "application/x-www-form-urlencoded" : "application/json",
  };

  return http.request(`http://localhost:${port}/${pathname}`, {
    method: "POST",
    headers,
  });
};

const genLambdaResponsePayload = ({ event, payload, requestId, lambdaName, success }: { event: any; payload: any; requestId: string; lambdaName: string; success: boolean }) => {
  const content: any = {
    version: "1.0",
    timestamp: "2023-02-25T13:25:04.688Z",
    requestContext: {
      requestId,
      functionArn: `arn:aws:lambda:eu-west-3:000000000000:function:${lambdaName}:$LATEST`,
      condition: success ? "Success" : "RetriesExhausted",
      approximateInvokeCount: 1,
    },
    requestPayload: event,
    responseContext: {
      statusCode: 200,
      executedVersion: "$LATEST",
    },
    responsePayload: payload,
  };

  if (!success) {
    content.responseContext["functionError"] = "Unhandled";
  }

  return JSON.stringify(content);
};

const genSnsParsedBody = ({ topicName, event, payload, requestId, success, lambdaName }: ISnsPayloadParams) => {
  let Message = "";

  if (success) {
    Message = genLambdaResponsePayload({ event, payload, requestId, success, lambdaName });
  } else {
    if (typeof event == "string") {
      Message = event;
    } else {
      try {
        Message = JSON.stringify(event);
      } catch (error) {
        console.log(error);
      }
    }
  }

  const body: any = {
    TopicArn: `arn:aws:sns:eu-west-3:000000000000:${topicName}`,
    Message,
    Action: "Publish",
    Version: "2010-03-31",
    MessageAttributes: {},
  };

  if (!success) {
    body.MessageAttributes = {
      RequestID: {
        Type: "String",
        Value: requestId,
      },
      ErrorCode: {
        Type: "String",
        Value: "200",
      },
      ErrorMessage: {
        Type: "String",
        Value: payload.errorMessage,
      },
    };
  }
  return JSON.stringify(body);
};

const genSqsBody = ({ destination, event, payload, requestId, lambdaName, success }: IGenResponse) => {
  const query = new URLSearchParams();
  query.append("QueueUrl", destination.name);
  query.append("Action", "SendMessage");

  let MessageBody = event;

  try {
    MessageBody = JSON.stringify(MessageBody);
  } catch (error) {}
  query.append("MessageBody", MessageBody);

  if (!success) {
    query.append("MessageAttribute.1.Name", "RequestID");
    query.append("MessageAttribute.1.Value.StringValue", requestId);
    query.append("MessageAttribute.1.Value.DataType", "String");

    query.append("MessageAttribute.1.Name", "ErrorCode");
    query.append("MessageAttribute.1.Value.StringValue", "200");
    query.append("MessageAttribute.1.Value.DataType", "Number");

    query.append("MessageAttribute.1.Name", "ErrorMessage");
    query.append("MessageAttribute.1.Value.StringValue", payload.errorMessage);
    query.append("MessageAttribute.1.Value.DataType", "String");
  }

  return query.toString();
};

const genResponse = ({ destination, event, payload, requestId, lambdaName, success }: IGenResponse) => {
  switch (destination.kind) {
    case "sns":
      return genSnsParsedBody({ topicName: destination.name, event, payload, requestId, success, lambdaName });
    case "lambda":
      return genLambdaResponsePayload({ event, payload, requestId, lambdaName, success });
    case "sqs":
      return genSqsBody({ destination, event, payload, requestId, lambdaName, success });
    default:
      return "";
  }
};

export const callErrorDest = ({ destination, LOCAL_PORT, event, payload, requestId, lambdaName }: ICallDestination) => {
  try {
    const req = genRequest(LOCAL_PORT, destination);

    if (!req) {
      return;
    }
    req.end(genResponse({ destination, event, payload, requestId, lambdaName, success: false }));
  } catch (error) {}
};

export const callSuccessDest = ({ destination, LOCAL_PORT, event, payload, requestId, lambdaName }: ICallDestination) => {
  try {
    const req = genRequest(LOCAL_PORT, destination);

    if (!req) {
      return;
    }

    req.end(genResponse({ destination, event, payload, requestId, lambdaName, success: true }));
  } catch (error) {}
};
