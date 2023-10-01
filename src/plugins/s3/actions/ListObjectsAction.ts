import type { IncomingHttpHeaders } from "http";

export class ListObjectsAction {
  Bucket: string;
  delimiter: string | null;
  encodingType: string | null;
  marker: string | null;
  maxKeys: number;
  prefix: string | null;
  expectedOwner: string | null;
  optionalObjectAttributes: string | null;
  requestPayer: string | null;
  constructor(url: URL, headers: IncomingHttpHeaders) {
    let filePath = decodeURIComponent(url.pathname.replace("/@s3/", ""));
    this.Bucket = filePath.split("/")[0];
    this.delimiter = url.searchParams.get("delimiter");
    this.encodingType = url.searchParams.get("encoding-type");
    this.marker = url.searchParams.get("marker");
    this.maxKeys = url.searchParams.has("max-keys") ? Number(url.searchParams.get("max-keys")) : 1000;
    this.prefix = url.searchParams.get("prefix");
    this.expectedOwner = url.searchParams.get("x-amz-expected-bucket-owner");
    this.optionalObjectAttributes = url.searchParams.get("x-amz-optional-object-attributes");
    this.requestPayer = url.searchParams.get("x-amz-request-payer");
  }
}
