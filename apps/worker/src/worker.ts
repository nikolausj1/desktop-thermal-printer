import { buildMessageReceipt } from "./escpos.js";
import { CloudClient } from "./cloud-client.js";
import type { WorkerConfig } from "./config.js";
import { PrinterSendError, sendToPrinter } from "./printer.js";
import { getPrinterHealth } from "./printer-status.js";
import type { JobCompletion, PrinterHealth, PrintJob } from "./types.js";

type LogLevel = "info" | "warn" | "error";

function log(level: LogLevel, event: string, details: Record<string, unknown> = {}): void {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...details,
  });
  (level === "error" ? console.error : console.log)(entry);
}

function printerAcceptingMessages(health: PrinterHealth): boolean {
  return (
    health.reachable &&
    health.coverOpen !== true &&
    health.cutterError !== true &&
    health.paperEnd !== true &&
    health.printerOffline !== true
  );
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

async function completeWithRetry(
  cloud: CloudClient,
  completion: JobCompletion,
  signal: AbortSignal,
): Promise<void> {
  let attempt = 0;
  while (!signal.aborted) {
    attempt += 1;
    try {
      await cloud.complete(completion);
      return;
    } catch (error) {
      log("error", "job_completion_update_failed", {
        jobId: completion.jobId,
        status: completion.status,
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });
      await delay(Math.min(30_000, 1000 * 2 ** Math.min(attempt - 1, 5)), signal);
    }
  }
}

async function processJob(
  config: WorkerConfig,
  cloud: CloudClient,
  job: PrintJob,
  signal: AbortSignal,
): Promise<void> {
  log("info", "job_claimed", { jobId: job.id, publicId: job.publicId });

  try {
    await cloud.markPrinting(config.workerId, job.id);
  } catch (error) {
    log("error", "job_mark_printing_failed", {
      jobId: job.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  let receipt: Buffer;
  try {
    receipt = buildMessageReceipt(job, config.displayTimezone);
  } catch (error) {
    await completeWithRetry(
      cloud,
      {
        jobId: job.id,
        workerId: config.workerId,
        status: "failed",
        failureCode: "receipt_format_failed",
        failureMessage: error instanceof Error ? error.message : String(error),
      },
      signal,
    );
    return;
  }

  log("info", "print_attempt", { jobId: job.id, bytes: receipt.length });
  try {
    await sendToPrinter({
      host: config.printerIp,
      port: config.printerPort,
      payload: receipt,
      timeoutMs: config.printerTimeoutMs,
    });
    await completeWithRetry(
      cloud,
      { jobId: job.id, workerId: config.workerId, status: "sent_to_printer" },
      signal,
    );
    log("info", "print_success", { jobId: job.id });
  } catch (error) {
    const deliveryUnknown = error instanceof PrinterSendError && error.deliveryUnknown;
    const completion: JobCompletion = {
      jobId: job.id,
      workerId: config.workerId,
      status: deliveryUnknown ? "delivery_unknown" : "failed",
      failureCode: deliveryUnknown ? "printer_delivery_unknown" : "printer_send_failed",
      failureMessage: error instanceof Error ? error.message : String(error),
    };
    await completeWithRetry(cloud, completion, signal);
    log("error", deliveryUnknown ? "print_delivery_unknown" : "print_failed", {
      jobId: job.id,
      error: completion.failureMessage,
    });
  }
}

export async function runWorker(
  config: WorkerConfig,
  cloud: CloudClient,
  signal: AbortSignal,
): Promise<void> {
  log("info", "worker_started", {
    workerId: config.workerId,
    workerVersion: config.workerVersion,
    printerId: config.printerId,
    printerAddress: `${config.printerIp}:${config.printerPort}`,
  });

  let nextHeartbeatAt = 0;
  let acceptingMessages = false;

  while (!signal.aborted) {
    if (Date.now() >= nextHeartbeatAt) {
      const health = await getPrinterHealth({
        host: config.printerIp,
        port: config.printerPort,
        timeoutMs: config.printerTimeoutMs,
        statusUrl: config.printerStatusUrl,
      });
      acceptingMessages = printerAcceptingMessages(health);
      try {
        await cloud.heartbeat({
          workerId: config.workerId,
          workerVersion: config.workerVersion,
          printerId: config.printerId,
          acceptingMessages,
          health,
        });
        log("info", "heartbeat_sent", {
          printerReachable: health.reachable,
          acceptingMessages,
          diagnosticCode: health.diagnosticCode,
        });
      } catch (error) {
        acceptingMessages = false;
        log("warn", "heartbeat_failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      nextHeartbeatAt = Date.now() + config.heartbeatIntervalMs;
    }

    if (acceptingMessages) {
      try {
        const job = await cloud.claim(config.workerId, config.printerId);
        if (job) await processJob(config, cloud, job, signal);
      } catch (error) {
        log("warn", "job_poll_failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await delay(config.pollIntervalMs, signal);
  }

  log("info", "worker_stopped", { workerId: config.workerId });
}
