export default async (event, context) => {
  const name = event.queryStringParameters?.name ?? "World";
  return {
    statusCode: 200,
    header: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: `Hello ${name}!` }),
  };
};
