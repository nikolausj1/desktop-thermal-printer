import postgres from "postgres";
import type { JobCompletion, PrintJob, WorkerHeartbeat } from "./types.js";

// The worker talks to the queue's database functions directly, through
// Supabase's connection pooler, as the papertelegram_worker role. That role
// can execute the four worker functions and nothing else (migration
// 20261028010000). It used to go through an edge function, but Supabase meters
// edge invocations and the 2 second poll exhausted the free quota every month,
// after which the whole API gateway is shut off; direct connections are
// neither metered nor restricted.

export class WorkerApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "WorkerApiError";
  }
}

interface ClaimRow {
  id: string;
  public_id: string;
  sequence_number: number | string;
  sender_name: string | null;
  message_text: string;
  submitted_at: Date | string;
  expires_at: Date | string;
  device_label: string | null;
  location_label: string | null;
  recipient: string | null;
  theme: string | null;
}

function isoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export class CloudClient {
  private readonly sql: ReturnType<typeof postgres>;

  constructor(databaseUrl: string, timeoutMs: number) {
    this.sql = postgres(databaseUrl, {
      ssl: "require",
      max: 1,
      prepare: false,
      connect_timeout: Math.max(1, Math.round(timeoutMs / 1000)),
      connection: {
        application_name: "paper-telegram-worker",
        statement_timeout: timeoutMs,
      },
    });
  }

  async heartbeat(heartbeat: WorkerHeartbeat): Promise<void> {
    const { health } = heartbeat;
    await this.query(
      () => this.sql`
        select public.record_worker_heartbeat(
          p_worker_id => ${heartbeat.workerId},
          p_worker_version => ${heartbeat.workerVersion},
          p_printer_id => ${heartbeat.printerId},
          p_accepting_messages => ${heartbeat.acceptingMessages === true},
          p_printer_reachable => ${health.reachable === true},
          p_cover_open => ${health.coverOpen},
          p_cutter_error => ${health.cutterError},
          p_paper_end => ${health.paperEnd},
          p_paper_near_end => ${health.paperNearEnd},
          p_printer_offline => ${health.printerOffline},
          p_error_code => ${health.diagnosticCode}
        )`,
    );
  }

  async claim(workerId: string, printerId: string): Promise<PrintJob | null> {
    const rows = await this.query<ClaimRow[]>(
      () => this.sql`select * from public.claim_next_print_job(${workerId}, ${printerId})`,
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      publicId: row.public_id,
      sequenceNumber: Number(row.sequence_number),
      senderName: row.sender_name,
      messageText: row.message_text,
      submittedAt: isoString(row.submitted_at),
      expiresAt: isoString(row.expires_at),
      deviceLabel: row.device_label,
      locationLabel: row.location_label,
      recipient: row.recipient,
      theme: row.theme,
    };
  }

  async markPrinting(workerId: string, jobId: string): Promise<void> {
    const rows = await this.query<{ ok: boolean }[]>(
      () => this.sql`select public.mark_print_job_printing(${jobId}::uuid, ${workerId}) as ok`,
    );
    if (rows[0]?.ok !== true) throw new WorkerApiError("Job cannot begin printing.", 409);
  }

  async complete(completion: JobCompletion): Promise<void> {
    const rows = await this.query<{ ok: boolean }[]>(
      () => this.sql`
        select public.complete_print_job(
          ${completion.jobId}::uuid,
          ${completion.workerId},
          ${completion.status},
          ${completion.failureCode ?? null},
          ${completion.failureMessage?.slice(0, 250) ?? null}
        ) as ok`,
    );
    if (rows[0]?.ok !== true) throw new WorkerApiError("Job cannot be completed.", 409);
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }

  private async query<T>(run: () => Promise<unknown>): Promise<T> {
    try {
      return (await run()) as T;
    } catch (error) {
      const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
      const code = typeof record.code === "string" ? ` (${record.code})` : "";
      const message = typeof record.message === "string" ? record.message : String(error);
      throw new WorkerApiError(`Database request failed${code}: ${message}`, null);
    }
  }
}
