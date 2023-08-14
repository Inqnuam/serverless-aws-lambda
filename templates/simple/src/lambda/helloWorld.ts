export default async (event, context) => {
  const name = event.queryStringParameters?.name ?? "World";

  LOCAL: {
    console.log("log this message only on local server")
  }
  
  return {
    statusCode: 200,
    header: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: `Hello ${name}!` }),
  };
};
