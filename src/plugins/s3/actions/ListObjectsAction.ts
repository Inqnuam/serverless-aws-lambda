import { S3LocalService } from "./localAction";
import type { IncomingHttpHeaders, ServerResponse } from "http";

abstract class ListObjectsAction extends S3LocalService {
  bucket: string;
  delimiter: string | null;
  encodingType: string | null;
  maxKeys: string | number = 1000;
  prefix: string | null;
  expectedOwner: string | null;
  optionalObjectAttributes: string | null;
  requestPayer: string | null;
  constructor(url: URL, headers: IncomingHttpHeaders) {
    super(headers);

    const [bucket] = decodeURIComponent(url.pathname.replace("/%40s3/", "").replace("/@s3/", "")).split("/").filter(Boolean);
    this.bucket = bucket;

    this.delimiter = url.searchParams.get("delimiter");
    this.encodingType = url.searchParams.get("encoding-type");
    const maxKeys = url.searchParams.get("max-keys");
    if (maxKeys) {
      this.maxKeys = maxKeys;
    }

    this.prefix = url.searchParams.get("prefix");
    this.expectedOwner = url.searchParams.get("x-amz-expected-bucket-owner");
    // TODO add support for optionalObjectAttributes
    this.optionalObjectAttributes = url.searchParams.get("x-amz-optional-object-attributes");
    this.requestPayer = url.searchParams.get("x-amz-request-payer");
  }

  getKeys() {
    let keys = Object.keys(S3LocalService.persistence.buckets[this.bucket].objects);
    if (this.prefix) {
      keys = keys.filter((x) => x.startsWith(this.prefix!));
    }
    keys.sort();
    return keys;
  }
  isInvalidMaxKeys(res: ServerResponse) {
    if (this.maxKeys) {
      if (isNaN(this.maxKeys as number)) {
        res.statusCode = 400;
        res.setHeader("Server", "AmazonS3");
        res.setHeader("Content-Type", "application/xml");
        res.setHeader("x-amzn-requestid", this.requestId);
        res.end(`<?xml version="1.0" encoding="UTF-8"?>
        <Error><Code>InvalidArgument</Code><Message>Provided max-keys not an integer or within integer range</Message><ArgumentName>max-keys</ArgumentName><ArgumentValue>${this.maxKeys}</ArgumentValue><RequestId>${this.requestId}</RequestId><HostId>local</HostId></Error>`);

        return true;
      }
      this.maxKeys = Number(this.maxKeys);

      if (this.maxKeys < 0 || this.maxKeys > 2147483647) {
        res.statusCode = 400;
        res.setHeader("Server", "AmazonS3");
        res.setHeader("Content-Type", "application/xml");
        res.setHeader("x-amzn-requestid", this.requestId);

        res.end(`<?xml version="1.0" encoding="UTF-8"?>
        <Error><Code>InvalidArgument</Code><Message>Argument maxKeys must be an integer between 0 and 2147483647</Message><ArgumentName>maxKeys</ArgumentName><ArgumentValue>${this.maxKeys}</ArgumentValue><RequestId>${this.requestId}</RequestId><HostId>local</HostId></Error>`);

        return true;
      }
    }
  }
}

function collapseCommonPrefixes(prefix: string, delimiter: string, keys: string[]): string[] {
  const commonPrefixes: string[] = [];

  for (const key of keys) {
    if (key.startsWith(prefix)) {
      const delimiterIndex: number = key.indexOf(delimiter, prefix.length);

      if (delimiterIndex > 0) {
        const commonPrefix: string = key.substring(0, delimiterIndex + delimiter.length);
        if (!commonPrefixes.includes(commonPrefix)) {
          commonPrefixes.push(commonPrefix);
        }
      }
    }
  }

  return commonPrefixes;
}

export class ListObjectsV1Action extends ListObjectsAction {
  marker: string | null;
  constructor(url: URL, headers: IncomingHttpHeaders) {
    super(url, headers);
    this.marker = url.searchParams.get("marker");
  }
  exec(res: ServerResponse) {
    if (this.hasNot(this.bucket, res)) {
      return;
    }

    if (this.isInvalidMaxKeys(res)) {
      return;
    }

    let IsTruncated = false;
    let nextMarker = "";
    let Delimiter = "";
    let commonPrefixes: string[] = [];
    let CommonPrefixes = "";

    let keys = this.getKeys();

    if (this.marker) {
      // @ts-ignore
      keys = keys.filter((x) => x.localeCompare(this.marker) > 0);

      // @ts-ignore
      const foundIndex = keys.findIndex((x) => x.startsWith(this.marker));

      if (foundIndex > -1) {
        keys = keys.slice(foundIndex + 1);
      }
    }

    const maxKeys = Number(this.maxKeys);

    const keyLen = keys.length;
    if (keyLen > maxKeys) {
      IsTruncated = true;
      keys = keys.slice(0, maxKeys);

      if (keyLen > keys.length) {
        nextMarker = keys[keys.length - 1];
      }
    }

    if (this.delimiter) {
      Delimiter = `<Delimiter>${this.delimiter}</Delimiter>`;
      commonPrefixes = collapseCommonPrefixes(this.prefix ?? "", this.delimiter, keys);

      if (this.marker) {
        commonPrefixes = commonPrefixes.filter((x) => x != this.marker);
      }
    }

    if (commonPrefixes.length) {
      keys = keys.filter((x) => !commonPrefixes.some((p) => x.startsWith(p)));

      CommonPrefixes = commonPrefixes.map((x) => `<CommonPrefixes><Prefix>${x}</Prefix></CommonPrefixes>`).join("");
    }

    if (this.marker && IsTruncated && !keys.length && commonPrefixes.length) {
      nextMarker = commonPrefixes[0];
    }

    res.statusCode = 200;
    res.setHeader("Server", "AmazonS3");
    res.setHeader("Content-Type", "application/xml");
    res.setHeader("x-amzn-requestid", this.requestId);

    const allContents = keys
      .map((x) => {
        const data = S3LocalService.persistence.buckets[this.bucket].objects[x];
        return `<Contents>
<Key>${x}</Key>
<LastModified>${new Date(data.LastModified).toISOString()}</LastModified>
<ETag>${data.ETag}</ETag>
<Size>${data.size}</Size>
<StorageClass>${data.StorageClass}</StorageClass>
</Contents>`;
      })
      .join("");

    res.end(`<?xml version="1.0" encoding="UTF-8"?>
  <ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Name>${this.bucket}</Name>
    <Prefix>${this.prefix ?? ""}</Prefix>
    ${this.marker ? `<Marker>${this.marker}</Marker>` : ""}
    ${Delimiter}
    ${CommonPrefixes}
    ${nextMarker ? `<NextMarker>${nextMarker}</NextMarker>` : ""}
    <MaxKeys>${this.maxKeys}</MaxKeys>
    <IsTruncated>${IsTruncated}</IsTruncated>
    ${allContents}
  </ListBucketResult>`);
  }
}

export class ListObjectsV2Action extends ListObjectsAction {
  continuationToken: string | null;
  fetchOwner: string | null;
  startAfter: string | null;

  constructor(url: URL, headers: IncomingHttpHeaders) {
    super(url, headers);
    this.continuationToken = url.searchParams.get("continuation-token");
    this.fetchOwner = url.searchParams.get("fetch-owner");
    this.startAfter = url.searchParams.get("start-after");
  }

  exec(res: ServerResponse) {
    if (this.hasNot(this.bucket, res)) {
      return;
    }

    if (this.isInvalidMaxKeys(res)) {
      return;
    }

    let IsTruncated = false;
    let NextContinuationToken = "";
    let Delimiter = "";
    let commonPrefixes: string[] = [];
    let CommonPrefixes = "";

    let keys = this.getKeys();

    let token = "";

    if (this.continuationToken) {
      token = Buffer.from(this.continuationToken, "base64").toString();
    } else if (this.startAfter) {
      token = this.startAfter;
    }

    if (token) {
      keys = keys.filter((x) => x.localeCompare(token) > 0);

      const foundIndex = keys.findIndex((x) => x.startsWith(token));

      if (foundIndex > -1) {
        keys = keys.slice(foundIndex + 1);
      }
    }

    const maxKeys = Number(this.maxKeys);

    const keyLen = keys.length;
    if (keyLen > maxKeys) {
      IsTruncated = true;
      keys = keys.slice(0, maxKeys);
    }

    if (this.delimiter) {
      Delimiter = `<Delimiter>${this.delimiter}</Delimiter>`;
      commonPrefixes = collapseCommonPrefixes(this.prefix ?? "", this.delimiter, keys);

      if (token) {
        commonPrefixes = commonPrefixes.filter((x) => x != token);
      }
    }

    if (commonPrefixes.length) {
      keys = keys.filter((x) => !commonPrefixes.some((p) => x.startsWith(p)));

      CommonPrefixes = commonPrefixes.map((x) => `<CommonPrefixes><Prefix>${x}</Prefix></CommonPrefixes>`).join("");
    }

    const KeyCount = keys.length + commonPrefixes.length;

    if (IsTruncated) {
      if (keys.length) {
        NextContinuationToken = Buffer.from(keys[keys.length - 1]).toString("base64");
      } else if (commonPrefixes.length) {
        NextContinuationToken = Buffer.from(commonPrefixes[0]).toString("base64");
      }
    }

    res.statusCode = 200;
    res.setHeader("Server", "AmazonS3");
    res.setHeader("Content-Type", "application/xml");
    res.setHeader("x-amzn-requestid", this.requestId);

    const allContents = keys
      .map((x) => {
        const data = S3LocalService.persistence.buckets[this.bucket].objects[x];
        return `<Contents>
  <Key>${x}</Key>
  <LastModified>${new Date(data.LastModified).toISOString()}</LastModified>
  <ETag>${data.ETag}</ETag>
  <Size>${data.size}</Size>
  <StorageClass>${data.StorageClass}</StorageClass>
</Contents>`;
      })
      .join("");

    res.end(`<?xml version="1.0" encoding="UTF-8"?>
    <ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
      <Name>${this.bucket}</Name>
      <Prefix>${this.prefix ?? ""}</Prefix>
      ${Delimiter}
      ${CommonPrefixes}
      <KeyCount>${KeyCount}</KeyCount>
      ${NextContinuationToken ? `<NextContinuationToken>${NextContinuationToken}</NextContinuationToken>` : ""}
      <MaxKeys>${this.maxKeys}</MaxKeys>
      <IsTruncated>${IsTruncated}</IsTruncated>
      ${this.continuationToken ? `<ContinuationToken>${this.continuationToken}</ContinuationToken>` : ""}
      ${!this.continuationToken && this.startAfter ? `<StartAfter>${this.startAfter}</StartAfter>` : ""}
      ${allContents}
    </ListBucketResult>`);
  }
}
