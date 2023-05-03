export interface IDocumentDbEvent {
  cluster: string;
  smk: string;
  db: string;
  auth?: "BASIC_AUTH";
  batchSize?: number;
  batchWindow?: number;
  collection?: string;
  document?: "Default" | "UpdateLookup";
  enabled?: boolean;
  startingPosition?: "LATEST" | "TRIM_HORIZON" | "AT_TIMESTAMP";
}

export const parseDocumentDb = (Outputs: any, resources: any, event: any): IDocumentDbEvent | undefined => {
  if (!event.documentDb) {
    return;
  }

  let parsedEvent: any = { ...event.documentDb };

  return parsedEvent;
};
