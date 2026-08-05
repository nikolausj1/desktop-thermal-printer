import net from "node:net";
import type { PrinterHealth } from "./types.js";

interface PrinterStatusOptions {
  host: string;
  port: number;
  timeoutMs: number;
  statusUrl: string;
}

function tcpReachable(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let finished = false;

    const finish = (reachable: boolean) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      resolve(reachable);
    };

    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once("error", () => finish(false));
    socket.once("connect", () => finish(true));
  });
}

function statusValue(html: string, labelPattern: string): boolean | null {
  const pattern = new RegExp(
    `${labelPattern}\\s*</TD>\\s*<TD>\\s*(Yes|No)`,
    "i",
  );
  const match = html.match(pattern);
  if (!match?.[1]) return null;
  return match[1].toLowerCase() === "yes";
}

export function parsePrinterStatusPage(html: string): Omit<
  PrinterHealth,
  "reachable" | "checkedAt" | "diagnosticCode"
> {
  return {
    coverOpen: statusValue(html, "Cover(?:&nbsp;|\\s)*Is(?:&nbsp;|\\s)*Open"),
    cutterError: statusValue(html, "Cutter(?:&nbsp;|\\s)*Error"),
    paperEnd: statusValue(html, "Paper(?:&nbsp;|\\s)*End"),
    paperNearEnd: statusValue(html, "Paper(?:&nbsp;|\\s)*Near(?:&nbsp;|\\s)*End"),
    printerOffline: statusValue(html, "Printer(?:&nbsp;|\\s)*Off-Line"),
  };
}

export async function getPrinterHealth(options: PrinterStatusOptions): Promise<PrinterHealth> {
  const reachable = await tcpReachable(options.host, options.port, options.timeoutMs);
  let diagnostics: ReturnType<typeof parsePrinterStatusPage> = {
    coverOpen: null,
    cutterError: null,
    paperEnd: null,
    paperNearEnd: null,
    printerOffline: null,
  };
  let diagnosticCode: string | null = reachable ? null : "tcp_unreachable";

  try {
    const response = await fetch(options.statusUrl, {
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    if (!response.ok) {
      diagnosticCode = diagnosticCode || `status_http_${response.status}`;
    } else {
      diagnostics = parsePrinterStatusPage(await response.text());
    }
  } catch {
    diagnosticCode = diagnosticCode || "status_page_unreachable";
  }

  return {
    reachable,
    ...diagnostics,
    checkedAt: new Date().toISOString(),
    diagnosticCode,
  };
}
