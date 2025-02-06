// @ts-ignore
export const handler = awslambda.streamifyResponse(async (event, responseStream, context) => {
  responseStream.write("1");
  responseStream.write("2");
  responseStream.write("3");

  if (event.streamThisValue) {
    responseStream.end(event.streamThisValue);
  } else {
    responseStream.end();
  }
});
