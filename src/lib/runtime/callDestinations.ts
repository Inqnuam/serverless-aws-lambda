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
}

type IGenResponse = Omit<ICallDestination, "LOCAL_PORT"> & { success: boolean };

const getDestinationPathname = (destination: IDestination) => {
  switch (destination.kind) {
    case "sns":
      return "@sns/parsed/";
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

  return http.request(`http://localhost:${port}/${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });
};

const genLambdaResponsePayload = ({ event, payload, requestId, lambdaName, success }: { event: any; payload: any; requestId: string; lambdaName: string; success: boolean }) => {
  const content: any = {
    version: "1.0",
    timestamp: "2023-02-25T13:25:04.688Z",
    requestContext: {
      requestId,
      functionArn: `arn:aws:lambda:eu-west-3:370838172639:function:${lambdaName}:$LATEST`,
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

const genSnsParsedBody = ({ topicName, event, payload, requestId, success }: ISnsPayloadParams) => {
  let Message = "";

  if (typeof event == "string") {
    Message = event;
  } else {
    try {
      Message = JSON.stringify(event);
    } catch (error) {}
  }

  const body = {
    TopicArn: `arn:aws:sns:eu-west-3:970838172639:${topicName}`,
    Message,
    Action: "Publish",
    Version: "2010-03-31",
    MessageAttributes: {
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
    },
  };

  // TODO: check if success/fail then put MessageAttributes

  return JSON.stringify(body);
};

const genResponse = ({ destination, event, payload, requestId, lambdaName, success }: IGenResponse) => {
  switch (destination.kind) {
    case "sns":
      return genSnsParsedBody({ topicName: destination.name, event, payload, requestId, success });
    case "lambda":
      return genLambdaResponsePayload({ event, payload, requestId, lambdaName, success });
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
    req.write(genResponse({ destination, event, payload, requestId, lambdaName, success: false }));

    req.end();
  } catch (error) {}
};

export const callSuccessDest = ({ destination, LOCAL_PORT, event, payload, requestId, lambdaName }: ICallDestination) => {
  try {
    const req = genRequest(LOCAL_PORT, destination);

    if (!req) {
      return;
    }
    req.write(genResponse({ destination, event, payload, requestId, lambdaName, success: true }));

    req.end();
  } catch (error) {}
};
