import { randomUUID } from "crypto";
import type { ILambdaMock } from "../rapidApi";
import { filterObject } from "./filter";

export interface IEventSourceMappingConfig {
  AmazonManagedKafkaEventSourceConfig?: {
    ConsumerGroupId: string;
  };
  BatchSize: number;
  BisectBatchOnFunctionError?: boolean;
  DestinationConfig?: {
    OnFailure: {
      Destination: string;
    };
    OnSuccess: {
      Destination: string;
    };
  };
  DocumentDBEventSourceConfig?: {
    CollectionName: string;
    DatabaseName: string;
    FullDocument: "UpdateLookup" | "Default";
  };
  Enabled: boolean;
  EventSourceArn: string;
  FilterCriteria?: {
    Filters: { Pattern: string }[];
  };
  FunctionName: string;
  FunctionResponseTypes?: ["ReportBatchItemFailures"];
  MaximumBatchingWindowInSeconds?: number;
  MaximumRecordAgeInSeconds?: number;
  MaximumRetryAttempts?: number;
  ParallelizationFactor?: number;
  Queues?: string[];
  ScalingConfig?: {
    MaximumConcurrency?: number;
  };
  SelfManagedEventSource?: {
    Endpoints?: string[];
  };
  SelfManagedKafkaEventSourceConfig?: {
    ConsumerGroupId?: string;
  };
  SourceAccessConfigurations?: {
    Type?:
      | "BASIC_AUTH"
      | "VPC_SUBNET"
      | "VPC_SECURITY_GROUP"
      | "SASL_SCRAM_512_AUTH"
      | "SASL_SCRAM_256_AUTH"
      | "VIRTUAL_HOST"
      | "CLIENT_CERTIFICATE_TLS_AUTH"
      | "SERVER_ROOT_CA_CERTIFICATE";
    URI?: string;
  }[];

  StartingPosition?: "TRIM_HORIZON" | "LATEST" | "AT_TIMESTAMP";
  StartingPositionTimestamp?: number;
  Topics?: string[];
  TumblingWindowInSeconds?: number;
}

export abstract class EventSourceMapping {
  static SOURCES: EventSourceMapping[] = [];
  UUID = randomUUID();
  LastModified = Date.now();
  LastProcessingResult: "No records processed" = "No records processed";
  State: "Creating" | "Enabling" | "Enabled" | "Disabling" | "Disabled" = "Creating";
  StateTransitionReason: "USER_INITIATED" | "User action" = "User action";

  constructor(public config: IEventSourceMappingConfig, public legacyDefinition: any) {}

  filterRecords(records: any[]) {
    const pass: any[] = [];
    const failed: any[] = [];

    if (!Array.isArray(this.config.FilterCriteria?.Filters)) {
      return [records, []];
    }

    for (const record of records) {
      const filterResult = this.config.FilterCriteria!.Filters.map((p) => filterObject(JSON.parse(p.Pattern), record));
      const hasPassedFilters = filterResult.find((x) => x === true);
      if (hasPassedFilters) {
        pass.push(record);
      } else {
        failed.push(record);
      }
    }

    return [pass, failed];
  }
}
