import { ServerResponse } from "http";

// ReqId: ESKQ7XZNYHG694XZ

// https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListBuckets.html#API_ListBuckets_RequestBody

export const notFoundKey = ({ key, requestId }: { key: string; requestId: string }, res: ServerResponse) => {
  const resContent = `<?xml version="1.0" encoding="UTF-8"?>
    <Error>
        <Code>NoSuchKey</Code>
        <Message>The specified key does not exist.</Message>
        <Key>${key}</Key>
        <RequestId>${requestId}</RequestId>
        <HostId>local</HostId>
    </Error>`;

  res.statusCode = 404;
  res.setHeader("x-amzn-requestid", requestId);
  res.setHeader("Content-Type", "application/xml");
  res.setHeader("Server", "AmazonS3");

  res.end(resContent);
};

export const copyObjectResponse = ({ LastModified, ETag, requestId }: { LastModified: string; ETag: string; requestId: string }, res: ServerResponse) => {
  const resContent = `<?xml version="1.0" encoding="UTF-8"?>
  <CopyObjectResult>
    <LastModified>${LastModified}</LastModified>
    <ETag>${ETag}</ETag>
  </CopyObjectResult>`;

  res.statusCode = 200;
  res.setHeader("x-amzn-requestid", requestId);
  res.setHeader("Content-Type", "application/xml");
  res.setHeader("Server", "AmazonS3");
  res.end(resContent);
};
