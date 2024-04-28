import { describe, it, expect } from "vitest";
import { filterObject } from "./filter";

describe("EventSourceMapping Filter", () => {
  it("Null", () => {
    const pattern = { UserID: [null] };

    expect(filterObject(pattern, { UserID: null })).toBe(true);
  });

  it("Empty", () => {
    const pattern = { UserID: [""] };

    expect(filterObject(pattern, { UserID: "" })).toBe(true);
  });

  it("Equals", () => {
    const pattern = { UserID: ["Alice"] };

    expect(filterObject(pattern, { UserID: "Alice" })).toBe(true);
  });

  it("Equals (ignore case)", () => {
    const pattern = { Name: [{ "equals-ignore-case": "alice" }] };

    expect(filterObject(pattern, { Name: "Alice" })).toBe(true);
    expect(filterObject(pattern, { Name: "Dalice" })).toBe(false);
  });

  it("Not (anything-but)", () => {
    const pattern = { Weather: [{ "anything-but": ["Raining"] }] };
    expect(filterObject(pattern, { Weather: "Sunny" })).toBe(true);
    expect(filterObject(pattern, { Weather: "Raining" })).toBe(false);
  });

  it("And", () => {
    const pattern = { Name: [{ "equals-ignore-case": "alice" }], id: ["56"] };

    expect(filterObject(pattern, { Name: "Alice", id: "56" })).toBe(true);
    expect(filterObject(pattern, { Name: "Alice", id: "32" })).toBe(false);
  });

  it("Or", () => {
    const pattern = { PaymentType: ["Credit", "Debit"] };

    expect(filterObject(pattern, { PaymentType: "Credit" })).toBe(true);
    expect(filterObject(pattern, { PaymentType: "Debit" })).toBe(true);
    expect(filterObject(pattern, { PaymentType: null })).toBe(false);
  });

  it("Or (multiple fields)", () => {
    const pattern = {
      victories: {
        tennis: {
          $or: [{ wimbeldon: [{ numeric: [">", 25] }] }, { usopen: [{ numeric: [">", 40] }] }],
        },
      },
    };

    expect(
      filterObject(pattern, {
        victories: {
          tennis: {
            wimbeldon: 87,
          },
        },
      })
    ).toBe(true);

    expect(
      filterObject(pattern, {
        victories: {
          tennis: {
            wimbeldon: 24,
          },
        },
      })
    ).toBe(false);

    expect(
      filterObject(pattern, {
        victories: {
          tennis: {
            usopen: 57,
          },
        },
      })
    ).toBe(true);

    expect(
      filterObject(pattern, {
        victories: {
          tennis: {
            usopen: 24,
          },
        },
      })
    ).toBe(false);
  });

  it("Numeric (equals)", () => {
    const pattern = { Price: [{ numeric: ["=", 100] }] };
    expect(filterObject(pattern, { Price: 100 })).toBe(true);
    expect(filterObject(pattern, { Price: "100" })).toBe(false);
    expect(filterObject(pattern, { contact: "+15336832723" })).toBe(false);
  });

  it("Numeric (range)", () => {
    const pattern = { Price: [{ numeric: [">", 10, "<=", 20] }] };
    expect(filterObject(pattern, { Price: 11 })).toBe(true);
  });

  it("Exists", () => {
    const pattern = { ProductName: [{ exists: true }] };
    expect(filterObject(pattern, { ProductName: "apple" })).toBe(true);
    expect(filterObject(pattern, { ProductName: null })).toBe(true);
    expect(filterObject(pattern, { name: "apple" })).toBe(false);

    const leafNodePattern = { person: { address: [{ exists: true }] } };

    const data = {
      person: {
        name: "John Doe",
        age: 30,
        address: {
          street: "123 Main St",
          city: "Anytown",
          country: "USA",
        },
      },
    };

    expect(filterObject(leafNodePattern, data)).toBe(false);
  });

  it("Does not exist", () => {
    const pattern = { ProductName: [{ exists: false }] };
    expect(filterObject(pattern, { ProductName: "apple" })).toBe(false);
    expect(filterObject(pattern, { ProductName: null })).toBe(false);
    expect(filterObject(pattern, { name: "apple" })).toBe(true);
  });

  it("Begins with", () => {
    const pattern = { Region: [{ prefix: "us-" }] };
    expect(filterObject(pattern, { Region: "us-california" })).toBe(true);
    expect(filterObject(pattern, { Region: "fr-paris" })).toBe(false);
  });

  it("Ends with", () => {
    const pattern = { FileName: [{ suffix: ".png" }] };
    expect(filterObject(pattern, { FileName: "photo.png" })).toBe(true);
    expect(filterObject(pattern, { FileName: "photo.jpg" })).toBe(false);
  });

  it("Deep nested pattern", () => {
    const pattern = {
      child1: {
        child2: {
          child3: {
            child4: {
              field1: [{ numeric: [">=", 57, "<", 60] }],
              field2: {
                dummy: {
                  filePath: [{ suffix: ".json" }],
                },
              },
              field3: [null],
            },
          },
        },
      },
    };

    const validData = {
      child1: {
        child2: {
          child3: {
            child4: {
              field1: 57,
              field2: {
                dummy: {
                  filePath: "/duumy/file/path.json",
                },
              },
              field3: null,
            },
          },
        },
      },
    };

    expect(filterObject(pattern, validData)).toBe(true);
    expect(filterObject(pattern, {})).toBe(false);

    const invalidData = {
      child1: {
        child2: {
          child3: {
            child4: {
              field1: 57,
              field2: {
                dummy: {
                  filePath: "/duumy/file/path.js",
                },
              },
              field3: null,
            },
          },
        },
      },
    };

    expect(filterObject(pattern, invalidData)).toBe(false);
  });
});
