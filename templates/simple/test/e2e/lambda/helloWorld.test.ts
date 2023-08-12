const baseURL = `http://localhost:${LOCAL_PORT}`;

describe("Test HelloWorld Lambda", () => {
  it("should say 'Hello John!'", async () => {
    const res = await fetch(`${baseURL}/sayhello?name=John`);
    const json = await res.json();

    expect(json.message).toBe("Hello John!");
  });

  it("should say 'Hello World!'", async () => {
    const res = await fetch(`${baseURL}/sayhello`);
    const json = await res.json();

    expect(json.message).toBe("Hello World!");
  });
});
