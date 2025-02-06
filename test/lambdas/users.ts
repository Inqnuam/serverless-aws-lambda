let createdUser;

export const handler = async (event) => {
  if (event.httpMethod == "POST") {
    createdUser = JSON.parse(event.body);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ createdUser }),
  };
};
