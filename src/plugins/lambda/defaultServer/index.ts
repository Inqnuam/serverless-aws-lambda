import { CommonEventGenerator } from "../events/common";
import { Handlers } from "../../../lib/server/handlers";
import { BufferedStreamResponse } from "../../../lib/runtime/bufferedStreamResponse";
import { collectBody, checkHeaders } from "../utils";
import { AlbRequestHandler } from "../events/alb";
import { ApgRequestHandler } from "../events/apg";
import { randomUUID } from "crypto";
import type { HttpMethod } from "../../../lib/server/handlers";
import type { LambdaEndpoint } from "../../../lib/parseEvents/endpoints";
import type { IncomingMessage, IncomingHttpHeaders, ServerResponse } from "http";
const getRequestMockType = (searchParams: URLSearchParams, headers: IncomingHttpHeaders) => {
  if (searchParams.get("x_mock_type") !== null) {
    return searchParams.get("x_mock_type");
  } else if (headers["x-mock-type"]) {
    if (Array.isArray(headers["x-mock-type"])) {
      return headers["x-mock-type"][0];
    } else {
      return headers["x-mock-type"];
    }
  }
};

interface ICreateEventHandler {
  req: IncomingMessage;
  res: ServerResponse;
  mockEvent: LambdaEndpoint;
  multiValueHeaders: any;
  lambdaName: string;
  isBase64Encoded: boolean;
  body: any;
  parsedURL: URL;
  requestId: string;
}

const createRequestHandler = (params: ICreateEventHandler) => {
  return params.mockEvent.kind == "alb" ? new AlbRequestHandler(params) : new ApgRequestHandler(params);
};

export const defaultServer = async (req: IncomingMessage, res: ServerResponse, parsedURL: URL) => {
  const { url, method, headers, rawHeaders } = req;
  const { searchParams } = parsedURL;

  const requestMockType = getRequestMockType(searchParams, headers);

  const multiValueHeaders = CommonEventGenerator.getMultiValueHeaders(rawHeaders);
  const normalizedQuery = CommonEventGenerator.normalizeSearchParams(searchParams, decodeURI(url!));
  const lambdaController = Handlers.findHandler({
    headers: multiValueHeaders,
    query: normalizedQuery,
    method: method as HttpMethod,
    path: decodeURIComponent(parsedURL.pathname),
    kind: requestMockType,
  });

  if (!lambdaController) {
    return;
  }

  const { event: mockEvent, handler } = lambdaController;

  try {
    checkHeaders(headers, mockEvent.kind);
  } catch (error: any) {
    res.statusCode = 400;
    res.setHeader("Content-Type", CommonEventGenerator.contentType.text);
    return res.end(error.message);
  }
  if (mockEvent.async) {
    res.statusCode = 200;
    res.end();
  }
  const requestId = randomUUID();
  const isBase64Encoded = CommonEventGenerator.getIsBase64Encoded(headers);
  const body = await collectBody(req, isBase64Encoded);

  const requestHandler = createRequestHandler({ req, res, body, isBase64Encoded, multiValueHeaders, mockEvent, lambdaName: handler.outName, parsedURL, requestId });

  try {
    let handlerOutput = await handler.invoke(requestHandler.payload, mockEvent);

    if (handlerOutput instanceof BufferedStreamResponse) {
      handlerOutput = handlerOutput.getParsedResponse();
    }
    requestHandler.sendResponse(handlerOutput);
  } catch (error) {
    return requestHandler.returnError(error);
  }

  return true;
};
