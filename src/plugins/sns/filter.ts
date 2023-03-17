const numericCompare = (operator: string, value: number, compareTo: number): boolean => {
  switch (operator) {
    case "=":
      return value == compareTo;
    case ">":
      return value > compareTo;
    case "<":
      return value < compareTo;
    case ">=":
      return value >= compareTo;
    case "<=":
      return value >= compareTo;
    default:
      return false;
  }
};

const expressionOperators: {
  [key: string]: (record: any, key: string, operatorValue: any) => boolean;
} = {
  exists: (record: any, key: string, operatorValue: any) => {
    if (operatorValue === true) {
      return key in record;
    } else if (operatorValue === false) {
      return !(key in record);
    } else {
      throw new Error("stream filter 'exists' value must be 'true' or 'false'");
    }
  },
  prefix: (record: any, key: string, operatorValue: any) => {
    if (typeof operatorValue !== "string") {
      throw new Error("SQS filter 'prefix' value must be typeof 'string'");
    }

    const val = typeof record[key] == "string" ? record[key] : undefined;

    if (val) {
      return val.startsWith(operatorValue);
    }
    return false;
  },
  numeric: (record: any, key: string, operatorValue: any) => {
    if (!Array.isArray(operatorValue) || ![2, 4].includes(operatorValue.length)) {
      throw new Error("SQS filter 'numeric' value must be an array with 2 or 4 items");
    }

    if (!(key in record)) {
      return false;
    }

    const andResult: boolean[] = [];
    const [comparator, value] = operatorValue;
    andResult.push(numericCompare(comparator, record[key], value));

    if (operatorValue.length == 4) {
      const [, , comparator, value] = operatorValue;
      andResult.push(numericCompare(comparator, record[key], value));
    }

    return andResult.every((x) => x === true);
  },
  "anything-but": (record: any, key: string, operatorValue: any) => {
    if (!Array.isArray(operatorValue) || !operatorValue.every((x) => typeof x == "string")) {
      throw new Error("SQS filter 'anything-but' value must be an array of string");
    }
    const val = typeof record[key] == "string" ? record[key] : undefined;
    if (val) {
      return !operatorValue.includes(val);
    }

    return false;
  },
};

const filter = (record: any, key: string, operator: any) => {
  const opType = typeof operator;
  if (opType == "string" || opType === null) {
    return record[key] == operator;
  } else if (opType == "object" && !Array.isArray(operator)) {
    const andConditions: boolean[] = [];

    for (const [opName, opValue] of Object.entries(operator)) {
      if (opName in expressionOperators) {
        andConditions.push(expressionOperators[opName](record, key, opValue));
      }
    }
    return andConditions.every((x) => x === true);
  }

  return false;
};

export const filterObject = (pattern: any, record: any) => {
  const filterResult: boolean[] = [];

  for (const [key, operator] of Object.entries(pattern)) {
    let childFilterResult: boolean[] = [];

    if (Array.isArray(operator)) {
      childFilterResult = operator.map((x) => filter(record, key, x));
    } else if (record[key]) {
      childFilterResult = [filterObject(operator, record[key])];
    }

    filterResult.push(childFilterResult.some((x) => x === true));
  }

  return filterResult.every((x) => x === true);
};
