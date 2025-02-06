import type { SlsAwsLambdaPlugin, ILambda } from "../../defineConfig";
import { getLocalStoragePath } from "./getLocalStoragePath";
import { parseGetRequest } from "./parsers/parseGetRequest";
import { parsePutRequest } from "./parsers/parsePutRequest";
import { parseHeadRequest } from "./parsers/parseHeadRequest";
import { parseDeleteRequest } from "./parsers/parseDeleteRequest";
import { parsePostRequest } from "./parsers/parsePostRequest";
import { S3LocalService } from "./actions/localAction";
import type { BucketConfig } from "./actions/localAction";

const filter = /^\/(@|%40)s3\/.*/;
interface IOptions {
  /**
   * Directory where S3 related files will be stored.
   * This directory will be created on app start.
   *
   * Use `persist` option to remove it on app exit.
   * @default "./localS3"
   */
  localStorageDir?: string;
  /**
   * Indicates if localStorageDir shoud be persistent.
   * @default true
   */
  persist?: boolean;
}

let callableLambdas: ILambda[] = [];
const s3Plugin = (options?: IOptions): SlsAwsLambdaPlugin => {
  const storagePath = getLocalStoragePath(options?.localStorageDir);
  S3LocalService.localStoragePath = storagePath;
  if (typeof options?.persist == "boolean") {
    S3LocalService.persist = options.persist;
  }

  return {
    name: "s3-local",
    onInit: async function () {
      if (!this.isDeploying && !this.isPackaging) {
        callableLambdas = this.lambdas.filter((x) => x.s3.length);
        S3LocalService.callableLambdas = callableLambdas;

        try {
          await S3LocalService.bootstrap();
        } catch (error) {}
      }
    },
    async onKill() {
      if (!this.isDeploying && !this.isPackaging) {
        try {
          S3LocalService.saveState();
        } catch (error) {}
      }
    },
    server: {
      async onReady() {
        const buckets: Record<string, BucketConfig> = {};
        Object.values(this.serverless.service.resources?.Resources ?? {}).forEach((x: any) => {
          if (x.Type == "AWS::S3::Bucket" && x.Properties?.BucketName) {
            if (!S3LocalService.isValidBucketName(x.Properties.BucketName)) {
              console.error(`Invalid Bucket Name: "${x.Properties.BucketName}"`);
              return;
            }

            const versioning = x.Properties.VersioningConfiguration?.Status;
            const deletionPolicy = x.DeletionPolicy ?? "Retain";
            if (S3LocalService.persistence.buckets[x.Properties.BucketName]) {
              S3LocalService.persistence.buckets[x.Properties.BucketName].versioning = versioning;
              S3LocalService.persistence.buckets[x.Properties.BucketName].deletionPolicy = deletionPolicy;
            } else {
              buckets[x.Properties.BucketName] = { versioning, deletionPolicy };
            }
          }
        });

        // @ts-ignore
        Object.values(this.serverless.service.provider.s3 ?? {}).forEach((x: any) => {
          if (x && typeof x == "object" && typeof x.name == "string") {
            if (!S3LocalService.isValidBucketName(x.name)) {
              console.error(`Invalid Bucket Name: "${x.name}"`);
              return;
            }
            const data: BucketConfig = { deletionPolicy: "Retain", versioning: x.versioningConfiguration?.Status };

            if (S3LocalService.persistence.buckets[x.name]) {
              S3LocalService.persistence.buckets[x.name].deletionPolicy = data.deletionPolicy;
              S3LocalService.persistence.buckets[x.name].versioning = data.versioning;
            } else {
              buckets[x.name] = data;
            }
          }
        });

        this.lambdas.forEach((l) => {
          l.s3.forEach((b) => {
            if (!S3LocalService.persistence.buckets[b.bucket] && !buckets[b.bucket]) {
              buckets[b.bucket] = { deletionPolicy: "Retain" };
            }
          });
        });

        for (const b of Object.keys(buckets)) {
          await S3LocalService.createBucketDir(b, buckets[b]);
        }
      },
      request: [
        {
          method: "HEAD",
          filter,
          callback: async function (req, res) {
            await parseHeadRequest(req).exec(res);
          },
        },
        {
          method: "GET",
          filter,
          callback: async function (req, res) {
            await parseGetRequest(req).exec(res);
          },
        },
        {
          method: "PUT",
          filter,
          callback: async function (req, res) {
            await parsePutRequest(req).exec(res, req);
          },
        },
        {
          method: "DELETE",
          filter,
          callback: async function (req, res) {
            await parseDeleteRequest(req).exec(res, req);
          },
        },
        {
          method: "POST",
          filter,
          async callback(req, res) {
            await parsePostRequest(req).exec(res, req);
          },
        },
      ],
    },
  };
};

export default s3Plugin;
export { s3Plugin };
