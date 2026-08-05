import { CloudClient } from "./cloud-client.js";
import { loadConfig } from "./config.js";
import { runWorker } from "./worker.js";

const config = loadConfig();
const cloud = new CloudClient(
  config.workerApiUrl,
  config.workerApiKey,
  config.cloudTimeoutMs,
);
const controller = new AbortController();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => controller.abort());
}

await runWorker(config, cloud, controller.signal);
