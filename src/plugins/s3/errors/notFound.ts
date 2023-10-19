export const noSuchBucket = ({ Bucket, RequestId }: { Bucket: string; RequestId: string }) => `<?xml version="1.0" encoding="UTF-8"?>
<Error><Code>NoSuchBucket</Code><Message>The specified bucket does not exist</Message><BucketName>${Bucket}</BucketName><RequestId>${RequestId}</RequestId><HostId>local</HostId></Error>
`;

export const noSuchKey = ({ Key, RequestId }: { Key: string; RequestId: string }) => `<?xml version="1.0" encoding="UTF-8"?>
<Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message><Key>${Key}</Key><RequestId>${RequestId}</RequestId><HostId>local</HostId></Error>`;
