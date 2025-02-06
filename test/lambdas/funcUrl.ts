// @ts-ignore
export const handler = awslambda.streamifyResponse(async (event, responseStream, context) => {
  // @ts-ignore
  responseStream = awslambda.HttpResponseStream.from(responseStream, { statusCode: 201 });
  responseStream.setContentType("application/json");
  responseStream.write({ hello: "awsome world" });

  responseStream.end();
});
