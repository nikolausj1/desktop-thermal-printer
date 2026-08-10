export type CompletionStatus = "sent_to_printer" | "failed" | "delivery_unknown";

export interface PrintJob {
  id: string;
  publicId: string;
  sequenceNumber: number;
  senderName: string | null;
  messageText: string;
  submittedAt: string;
  expiresAt: string;
  deviceLabel: string | null;
  locationLabel: string | null;
  recipient?: string | null;
  theme?: string | null;
}

export interface PrinterHealth {
  reachable: boolean;
  coverOpen: boolean | null;
  cutterError: boolean | null;
  paperEnd: boolean | null;
  paperNearEnd: boolean | null;
  printerOffline: boolean | null;
  checkedAt: string;
  diagnosticCode: string | null;
}

export interface WorkerHeartbeat {
  workerId: string;
  workerVersion: string;
  printerId: string;
  acceptingMessages: boolean;
  health: PrinterHealth;
}

export interface JobCompletion {
  jobId: string;
  workerId: string;
  status: CompletionStatus;
  failureCode?: string;
  failureMessage?: string;
}
