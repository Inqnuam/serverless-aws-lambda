import type { Event } from "serverless/aws";

export interface ICommonConfig {
  environment?: Record<string, string>;
  /**
   * Lambda timeout
   *
   * @default 3
   */
  timeout?: number;
  /**
   *
   * @example "nodejs18.x"
   * @example "python3.7"
   * @example "ruby2.7"
   */
  runtime?: `node${number}${string}` | `python${number}${string}` | `ruby${number}${string}`;

  /**
   * @default 1024
   */
  memorySize?: number;
}

export interface IEventsAlb {
  alb: Event["alb"];
  http?: never;
  httpApi?: never;
  s3?: never;
  sns?: never;
  sqs?: never;
  stream?: never;
}

export interface IEventsHttp {
  alb?: never;
  http: "*" | `${"GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD" | "ANY"} /${string}` | Event["http"];
  httpApi?: never;
  s3?: never;
  sns?: never;
  sqs?: never;
  stream?: never;
}

export interface IEventsHttpApi {
  alb?: never;
  http?: never;
  httpApi: "*" | `${"GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD" | "ANY"} /${string}` | Event["httpApi"];
  s3?: never;
  sns?: never;
  sqs?: never;
  stream?: never;
}

export interface IEventsS3 {
  alb?: never;
  http?: never;
  httpApi?: never;
  s3: string | Event["s3"];
  sns?: never;
  sqs?: never;
  stream?: never;
}

export interface IEventsSns {
  alb?: never;
  http?: never;
  httpApi?: never;
  s3?: never;
  sns: string | Event["sns"];
  sqs?: never;
  stream?: never;
}

export interface IEventsSqs {
  alb?: never;
  http?: never;
  httpApi?: never;
  s3?: never;
  sns?: never;
  sqs: string | Event["sqs"];
  stream?: never;
}

export interface IEventsStream {
  alb?: never;
  http?: never;
  httpApi?: never;
  s3?: never;
  sns?: never;
  sqs?: never;
  stream: string | Event["stream"];
}

export type IEvents = IEventsAlb | IEventsHttp | IEventsHttpApi | IEventsS3 | IEventsSns | IEventsSqs | IEventsStream;

export type ILambdaFunction = {
  name: string;
  /**
   * Path to local handler with exported handler name as file extension
   *
   * @example "src/lambdas/create.handler"
   */
  handler: `${string}.${string}`;
  events?: IEvents[];
  url?: boolean | { invokeMode: "RESPONSE_STREAM" | "BUFFERED" };
} & ICommonConfig;

export interface ServerOptions {
  /**
   * @default `process.env.SLS_DEBUG == "*"`
   */
  debug?: boolean;
  /** @default 0 (random port) */
  port?: number;
  defaults?: ICommonConfig;
  functions?: ILambdaFunction[];
  configPath?: string;
  onKill?: () => Promise<void> | void;
}
