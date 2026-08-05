export interface WorkerConfig {
  workerApiUrl: string;
  workerApiKey: string;
  workerId: string;
  workerVersion: string;
  printerId: string;
  printerIp: string;
  printerPort: number;
  printerTimeoutMs: number;
  printerStatusUrl: string;
  heartbeatIntervalMs: number;
  pollIntervalMs: number;
  cloudTimeoutMs: number;
  displayTimezone: string;
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function positiveInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const raw = environment[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer from 1 through ${maximum}.`);
  }
  return value;
}

function validateWorkerApiUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (url.protocol !== "https:" && !localHosts.has(url.hostname)) {
    throw new Error("WORKER_API_URL must use HTTPS unless it targets localhost.");
  }
  return url.toString();
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const printerIp = environment.PRINTER_IP?.trim() || "192.168.4.77";

  return {
    workerApiUrl: validateWorkerApiUrl(required(environment, "WORKER_API_URL")),
    workerApiKey: required(environment, "WORKER_API_KEY"),
    workerId: environment.WORKER_ID?.trim() || "desktop-printer-nuc",
    workerVersion: environment.WORKER_VERSION?.trim() || "0.2.0",
    printerId: environment.PRINTER_ID?.trim() || "desk-rp820",
    printerIp,
    printerPort: positiveInteger(environment, "PRINTER_PORT", 9100, 65535),
    printerTimeoutMs: positiveInteger(environment, "PRINTER_TIMEOUT_MS", 5000, 60_000),
    printerStatusUrl:
      environment.PRINTER_STATUS_URL?.trim() || `http://${printerIp}/prn_stat.htm`,
    heartbeatIntervalMs:
      positiveInteger(environment, "HEARTBEAT_INTERVAL_SECONDS", 15, 3600) * 1000,
    pollIntervalMs: positiveInteger(environment, "POLL_INTERVAL_SECONDS", 2, 3600) * 1000,
    cloudTimeoutMs: positiveInteger(environment, "CLOUD_TIMEOUT_MS", 10_000, 60_000),
    displayTimezone: environment.DISPLAY_TIMEZONE?.trim() || "America/Los_Angeles",
  };
}
