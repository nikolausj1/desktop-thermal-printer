import type { JobCompletion, PrintJob, WorkerHeartbeat } from "./types.js";

interface WorkerApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export class WorkerApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "WorkerApiError";
  }
}

export class CloudClient {
  constructor(
    private readonly url: string,
    private readonly apiKey: string,
    private readonly timeoutMs: number,
  ) {}

  async heartbeat(heartbeat: WorkerHeartbeat): Promise<void> {
    await this.request<undefined>("heartbeat", heartbeat);
  }

  async claim(workerId: string, printerId: string): Promise<PrintJob | null> {
    return this.request<PrintJob | null>("claim", { workerId, printerId });
  }

  async markPrinting(workerId: string, jobId: string): Promise<void> {
    await this.request<undefined>("mark_printing", { workerId, jobId });
  }

  async complete(completion: JobCompletion): Promise<void> {
    await this.request<undefined>("complete", completion);
  }

  private async request<T>(action: string, payload: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(this.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-worker-api-key": this.apiKey,
        },
        body: JSON.stringify({ action, payload }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new WorkerApiError(`Worker API request failed: ${message}`, null);
    }

    const rawBody = await response.text();
    let body: WorkerApiResponse<T>;
    try {
      body = JSON.parse(rawBody) as WorkerApiResponse<T>;
    } catch {
      throw new WorkerApiError(
        `Worker API returned invalid JSON with status ${response.status}.`,
        response.status,
      );
    }

    if (!response.ok || !body.ok) {
      throw new WorkerApiError(
        body.error || `Worker API returned status ${response.status}.`,
        response.status,
      );
    }

    return body.data as T;
  }
}
