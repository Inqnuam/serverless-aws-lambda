// https://docs.aws.amazon.com/lambda/latest/dg/invocation-eventfiltering.html

import { isJsObject } from "./utils";

const numericCompare = (operator: string, value: number, compareTo: number): boolean => {
  switch (operator) {
    case "=":
      return value === compareTo;
    case ">":
      return value > compareTo;
    case "<":
      return value < compareTo;
    case ">=":
      return value >= compareTo;
    case "<=":
      return value <= compareTo;
    default:
      return false;
  }
};

const expressionOperators = {
  exists: (record: any, key: string, operatorValue: any) => {
    if (operatorValue === true) {
      return key in record && !isJsObject(record[key]);
    } else if (operatorValue === false) {
      return !(key in record);
    }
  },
  prefix: (record: any, key: string, operatorValue: any) => {
    const val = typeof record[key] == "string" ? record[key] : undefined;

    if (val) {
      return val.startsWith(operatorValue);
    }
    return false;
  },
  suffix: (record: any, key: string, operatorValue: any) => {
    const val = typeof record[key] == "string" ? record[key] : undefined;

    if (val) {
      return val.endsWith(operatorValue);
    }
    return false;
  },
  numeric: (record: any, key: string, operatorValue: any) => {
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
    const val = typeof record[key] == "string" ? record[key] : undefined;
    if (val) {
      return !operatorValue.includes(val);
    }

    return false;
  },
  "equals-ignore-case": (record: any, key: string, operatorValue: any) => {
    if (typeof record?.[key] != "string") {
      return false;
    }

    return (record[key] as string).toLowerCase() == operatorValue.toLowerCase();
  },
};

const filter = (record: any, key: string, operator: any) => {
  if (operator === null) {
    return record[key] === null;
  }

  const opType = typeof operator;

  if (opType == "string") {
    return record[key] == operator;
  } else if (opType == "object" && !Array.isArray(operator)) {
    const andConditions: boolean[] = [];

    for (const [opName, opValue] of Object.entries(operator)) {
      if (opName in expressionOperators) {
        andConditions.push(expressionOperators[opName as keyof typeof expressionOperators](record, key, opValue) as boolean);
      }
    }
    return andConditions.every((x) => x === true);
  }

  return false;
};

const isFilterExpression = Array.isArray;
const isNestedPath = (field: any) => field && typeof field == "object" && !Array.isArray(field);

export const filterObject = (pattern: any, data: any) => {
  const filterResult: boolean[] = [];

  for (const [key, operator] of Object.entries(pattern)) {
    let childFilterResult: boolean[] = [];

    if (isFilterExpression(operator)) {
      if (key == "$or") {
        childFilterResult = operator.map((x) => filterObject(x, data));
      } else {
        childFilterResult = operator.map((x) => filter(data, key, x));
      }

      filterResult.push(childFilterResult.some((x) => x === true));
    } else if (isNestedPath(data[key])) {
      if (filterObject(operator, data[key])) {
        filterResult.push(true);
      } else {
        filterResult.push(false);
      }
    } else {
      filterResult.push(false);
    }
  }

  return filterResult.every((x) => x === true);
};
