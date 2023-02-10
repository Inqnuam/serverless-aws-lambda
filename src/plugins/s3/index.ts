import type { SlsAwsLambdaPlugin, ILambda } from "../../defineConfig";
import { access, stat, mkdir, rm, copyFile } from "fs/promises";
import { createReadStream, createWriteStream } from "fs";
import { RequestParser } from "./parseRequest";
import { notFoundKey, copyObjectResponse } from "./s3Responses";
import { calulcateETag } from "./calulcateETag";
import { triggerEvent } from "./triggerEvent";
import { getLocalStoragePath } from "./getLocalStoragePath";
import path from "path";

interface IOptions {
  localStorageDir?: string;
}

let callableLambdas: ILambda[] = [];
const s3Plugin = (options?: IOptions): SlsAwsLambdaPlugin => {
  const storagePath = getLocalStoragePath(options?.localStorageDir);
  const request = new RequestParser(storagePath);

  return {
    name: "s3-local",
    onInit: function () {
      callableLambdas = this.lambdas.filter((x) => x.s3.length);
    },
    offline: {
      request: [
        {
          method: "HEAD",
          filter: /^\/@s3\/.*/,
          callback: async function (req, res) {
            const { filePath, keyName, requestId } = request.deserialize(req);

            try {
              const fileStat = await stat(filePath);

              const ETag = calulcateETag({
                fileSizeInBytes: fileStat.size,
                filePath,
              });

              res.writeHead(200, {
                "x-amz-id-2": "Jlw7ZDxNF0nnIcNbUG0TpuYia9hBMqI/W8vMDyNTB5oZ/7ARNqYW5/l3VPURZIj0pkKhCOqSazo=",
                "x-amzn-requestid": requestId,
                "x-amz-server-side-encryption": "AES256",
                "Content-Type": "application/octet-stream",
                "Content-Length": fileStat.size,
                Date: new Date().toUTCString(),
                "Last-Modified": new Date(fileStat.mtimeMs).toUTCString(),
                ETag: `"${ETag}"`,
                Server: "AmazonS3",
              });

              res.end();
            } catch (error) {
              notFoundKey({ key: keyName, requestId: requestId as string }, res);
            }
          },
        },

        {
          method: "GET",
          filter: /^\/@s3\/.*/,
          callback: async function (req, res) {
            const { requestCmd, filePath, keyName, requestId } = request.deserialize(req);

            if (requestCmd == "GetObject") {
              const fileStat = await stat(filePath);

              const ETag = calulcateETag({
                fileSizeInBytes: fileStat.size,
                filePath,
              });
              try {
                res.writeHead(200, {
                  "x-amz-id-2": "Jlw7ZDxNF0nnIcNbUG0TpuYia9hBMqI/W8vMDyNTB5oZ/7ARNqYW5/l3VPURZIj0pkKhCOqSazo=",
                  "x-amzn-requestid": requestId,
                  "x-amz-server-side-encryption": "AES256",
                  "Content-Type": "application/octet-stream",
                  "Content-Length": fileStat.size,
                  "Accept-Ranges": "bytes",
                  Date: new Date().toUTCString(),
                  "Last-Modified": new Date(fileStat.mtimeMs).toUTCString(),
                  ETag: `"${ETag}"`,
                  Server: "AmazonS3",
                });

                createReadStream(filePath).pipe(res);
              } catch (error) {
                notFoundKey({ key: keyName, requestId: requestId as string }, res);
              }
            } else {
              console.log(`'${requestCmd}' is not implemented yet`);
              notFoundKey({ key: keyName, requestId: requestId as string }, res);
            }
          },
        },
        {
          method: "PUT",
          filter: /^\/@s3\/.*/,
          callback: async function (req, res) {
            const { requestCmd, filePath, bucketName, keyName, requestId, copySource, sourceIPAddress } = request.deserialize(req);

            if (requestCmd == "PutObject") {
              try {
                await access(filePath);
              } catch (error) {
                await mkdir(path.dirname(filePath), { recursive: true });
              }
              const savingFile = createWriteStream(filePath);
              res.setHeader("status", 100);
              res.setHeader("Server", "AmazonS3");

              req.on("end", async () => {
                res.end();

                try {
                  const fileStat = await stat(filePath);

                  const ETag = calulcateETag({
                    fileSizeInBytes: fileStat.size,
                    filePath,
                  });

                  triggerEvent(callableLambdas, {
                    bucket: bucketName,
                    key: keyName,
                    requestId,
                    requestCmd,
                    eTag: ETag,
                    sourceIPAddress,
                    size: fileStat.size,
                  });
                } catch (error) {
                  console.log(error);
                }
              });
              req.pipe(savingFile);
            } else if (requestCmd == "CopyObject") {
              try {
                await access(copySource);
                await copyFile(copySource, filePath);
                const fileStat = await stat(filePath);

                const ETag = calulcateETag({
                  fileSizeInBytes: fileStat.size,
                  filePath,
                });

                copyObjectResponse(
                  {
                    LastModified: new Date(fileStat.mtimeMs).toUTCString(),
                    ETag,
                    requestId,
                  },
                  res
                );

                try {
                  const fileStat = await stat(filePath);

                  const ETag = calulcateETag({
                    fileSizeInBytes: fileStat.size,
                    filePath,
                  });

                  triggerEvent(callableLambdas, {
                    bucket: bucketName,
                    key: keyName,
                    requestId,
                    requestCmd,
                    eTag: ETag,
                    sourceIPAddress,
                    size: fileStat.size,
                  });
                } catch (error) {
                  console.log(error);
                }
              } catch (error) {
                notFoundKey({ key: copySource.split("/").slice(2).join("/"), requestId: requestId as string }, res);
              }
            } else {
              console.log(`'${requestCmd}' is not implemented yet`);
              res.statusCode = 502;
              res.end();
            }
          },
        },
        {
          method: "DELETE",
          filter: /^\/@s3\/.*/,
          callback: async function (req, res) {
            const { requestCmd, filePath, bucketName, keyName, requestId, sourceIPAddress } = request.deserialize(req);

            if (requestCmd == "DeleteObject") {
              try {
                const stats = await stat(filePath);

                if (stats.isFile()) {
                  await rm(filePath);
                }
              } catch (error) {}

              res.statusCode = 204;
              res.setHeader("x-amzn-requestid", requestId);
              res.setHeader("Server", "AmazonS3");
              res.end();

              try {
                const fileStat = await stat(filePath);

                const ETag = calulcateETag({
                  fileSizeInBytes: fileStat.size,
                  filePath,
                });

                triggerEvent(callableLambdas, {
                  bucket: bucketName,
                  key: keyName,
                  requestId,
                  requestCmd,
                  eTag: ETag,
                  sourceIPAddress,
                  size: fileStat.size,
                });
              } catch (error) {
                console.log(error);
              }
            } else {
              console.log(`'${requestCmd}' is not implemented yet`);
              res.statusCode = 502;
              res.end();
            }
          },
        },
      ],
    },
  };
};

export default s3Plugin;
export { s3Plugin };
