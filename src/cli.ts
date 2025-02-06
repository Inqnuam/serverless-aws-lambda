#!/usr/bin/env node

import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { run, type ILambdaFunction } from "./standalone" with { external: "true" };
import { log } from "./lib/utils/colorize";

function printHelpAndExit() {
  log.setDebug(true);
  log.GREY("Usage example:");

  console.log(`aws-lambda -p 3000 --debug --functions "src/lambdas/**/*.ts"\n`);

  log.BR_BLUE("Options:");

  for (const [optionName, value] of Object.entries(options)) {
    let printableName = optionName;

    if (value.short) {
      printableName += `, -${value.short}`;
    }

    let content = `\t\ttype: ${value.type}`;
    if (value.description) {
      content += `\n\t\tdescription: ${value.description}`;
    }

    if ("default" in value) {
      content += `\n\t\tdefault: ${value.default}`;
    }
    if (value.example) {
      content += `\n\t\texample: ${value.example}`;
    }

    content += "\n";

    log.CYAN(`\t --${printableName}`);
    log.GREY(content);
  }

  process.exit(0);
}

function getNumberOrDefault(value: any, defaultValue: number) {
  if (!value || isNaN(value)) {
    return defaultValue;
  }

  return Number(value);
}

async function getFunctionsDefinitionFromFile(filePath?: string) {
  if (!filePath) {
    return;
  }

  if (filePath.endsWith(".js")) {
    throw new Error("Only .json, .mjs and .cjs are supported for --definitions option.");
  }

  if (filePath.endsWith(".json")) {
    const defs = JSON.parse(await readFile(filePath, "utf-8"));
    return defs.functions;
  }

  if (filePath.endsWith(".mjs") || filePath.endsWith(".cjs")) {
    const modulePath = pathToFileURL(path.resolve(process.cwd(), filePath)).href;
    const mod = await import(modulePath);

    return mod.functions;
  }
}

async function getFromGlob(excludePattern: RegExp, handlerName: string, matchPattern?: string[]) {
  if (!matchPattern) {
    return;
  }

  const majorNodeVersion = Number(process.versions.node.slice(0, process.versions.node.indexOf(".")));

  if (majorNodeVersion < 22) {
    throw new Error("--functions option is only supported on Node22 and higher.");
  }

  const { glob } = await import("node:fs/promises");

  const handlers: Map<string, ILambdaFunction> = new Map();

  for await (const entry of glob(matchPattern)) {
    if (entry.match(excludePattern)) {
      continue;
    }

    const parent = path.basename(path.dirname(entry));
    const parsedPath = path.parse(entry);

    let funcName: string;

    if (parsedPath.name == "index") {
      if (!handlers.has(parent)) {
        funcName = parent;
      } else {
        funcName = entry.replaceAll(path.sep, "_");
      }
    } else {
      if (!handlers.has(parsedPath.name)) {
        funcName = parsedPath.name;
      } else if (!handlers.has(`${parent}_${parsedPath.name}`)) {
        funcName = `${parent}_${parsedPath.name}`;
      } else {
        funcName = entry.replaceAll(path.sep, "_");
      }
    }

    handlers.set(funcName, {
      name: funcName,
      // @ts-ignore
      handler: entry.replace(parsedPath.ext, `.${handlerName}`),
      // @ts-ignore
      runtime: parsedPath.ext == ".py" ? "python3.7" : parsedPath.ext == ".rb" ? "ruby2.7" : `nodejs${majorNodeVersion}.x`,
    });
  }

  return Array.from(handlers.values());
}

function getDefaultEnvs(env: string[]) {
  const environment: Record<string, string> = {};

  for (const s of env) {
    const [key, ...rawValue] = s.split("=");

    environment[key] = rawValue.join("=");
  }

  return environment;
}

interface ICliOptions {
  type: "string" | "boolean";
  multiple?: boolean | undefined;
  short?: string | undefined;
  default?: string | boolean | string[] | boolean[] | undefined;
  description?: string;
  example?: string;
}

const options: Record<string, ICliOptions> = {
  port: { type: "string", short: "p", default: "0", description: "Set server port." },
  debug: { type: "boolean", default: false, description: "Enable debug mode. When enabled aws-lambda will print usefull informations." },
  config: { type: "string", short: "c", description: "Path to 'defineConfig' file." },
  runtime: { type: "string", short: "r", description: "Set default runtime (ex: nodejs22.x, python3.7, ruby2.7 etc.)." },
  timeout: { type: "string", short: "t", default: "3", description: "Set default timeout." },
  definitions: { type: "string", short: "d", description: "Path to .json, .mjs, .cjs file with Lambda function definitions." },
  functions: { type: "string", short: "f", multiple: true, description: "Glob pattern to automatically find and define Lambda handlers." },
  exclude: { type: "string", short: "x", default: "\.(test|spec)\.", description: "RegExp string to exclude found enteries from --functions." },
  handlerName: { type: "string", default: "handler", description: "Handler function name. To be used with --functions." },
  env: {
    type: "string",
    short: "e",
    multiple: true,
    default: [],
    description: "Environment variables to be injected into Lambdas. All existing AWS_* are automatically injected.",
    example: "-e API_KEY=supersecret -e API_URL=https://website.com",
  },
  help: { type: "boolean", short: "h" },
};

const { values } = parseArgs({
  strict: false as true,
  options,
});

const { port, config, debug, help, runtime, definitions, timeout, functions, handlerName, exclude, env } = values;

if (help) {
  printHelpAndExit();
}

if (definitions && functions) {
  throw new Error("Can not use --definitions (-d) and  --functions (-f) together.");
}

// @ts-ignore
const functionDefs = functions ? await getFromGlob(new RegExp(exclude), handlerName, functions as string[]) : await getFunctionsDefinitionFromFile(definitions as string);

run({
  // @ts-ignore
  debug,
  // @ts-ignore
  configPath: config,
  port: getNumberOrDefault(port, 0),
  functions: functionDefs,
  defaults: {
    // @ts-ignore
    environment: getDefaultEnvs(env),
    // @ts-ignore
    runtime,
    timeout: getNumberOrDefault(timeout, 3),
  },
});
