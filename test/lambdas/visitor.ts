let count = 0;
export const handler = async (event, context) => {
  count++;

  return {
    count,
    HELLO: process.env.HELLO,
    payload: event,
    clientContext: context.clientContext,
  };
};
