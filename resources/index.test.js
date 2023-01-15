const axios = require("axios");

const { LOCAL_PORT } = process.env;

test("My First test", async () => {
  const res = await axios.get(`http://localhost:${LOCAL_PORT}/myAwsomeLambda`);

  expect(res.status).toBe(200);
});

describe("Some description", () => {
  it("bar", () => {
    expect(1 + 1).toBe(2);
  });

  it("snapshot", () => {
    expect({ foo: "bar" }).toMatchSnapshot();
  });
});
