import net from "node:net";

export class PrinterSendError extends Error {
  constructor(
    message: string,
    readonly deliveryUnknown: boolean,
  ) {
    super(message);
    this.name = "PrinterSendError";
  }
}

interface SendOptions {
  host: string;
  port: number;
  payload: Buffer;
  timeoutMs: number;
}

export function sendToPrinter(options: SendOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: options.host, port: options.port });
    let settled = false;
    let bytesAcceptedBySocket = false;

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new PrinterSendError(message, bytesAcceptedBySocket));
    };

    socket.setNoDelay(true);
    socket.setTimeout(options.timeoutMs, () => {
      fail(`Printer connection timed out after ${options.timeoutMs} ms.`);
    });
    socket.once("error", (error) => fail(`Printer socket error: ${error.message}`));
    socket.once("connect", () => {
      socket.write(options.payload, (error) => {
        if (error) {
          fail(`Printer write failed: ${error.message}`);
          return;
        }
        bytesAcceptedBySocket = true;
        socket.end();
      });
    });
    socket.once("close", (hadError) => {
      if (settled || hadError) return;
      settled = true;
      resolve();
    });
  });
}
