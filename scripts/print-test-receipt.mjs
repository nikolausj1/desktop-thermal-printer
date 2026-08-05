#!/usr/bin/env node

import net from "node:net";

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;
const FONT_A_WIDTH = 48;
const FONT_B_WIDTH = 64;

function parseArguments(argv) {
  const options = {
    host: process.env.PRINTER_IP ?? "192.168.4.77",
    port: Number(process.env.PRINTER_PORT ?? 9100),
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--host") {
      options.host = argv[index + 1];
      index += 1;
    } else if (argument === "--port") {
      options.port = Number(argv[index + 1]);
      index += 1;
    } else if (argument === "--dry-run") {
      options.dryRun = true;
    } else if (argument === "--help" || argument === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!options.host) {
    throw new Error("Printer host is required.");
  }

  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error("Printer port must be an integer from 1 through 65535.");
  }

  return options;
}

function printUsage() {
  console.log(`Usage: node scripts/print-test-receipt.mjs [options]

Options:
  --host <address>  Printer address (default: PRINTER_IP or 192.168.4.77)
  --port <number>   Raw TCP port (default: PRINTER_PORT or 9100)
  --dry-run         Build and validate the receipt without sending it
  -h, --help        Show this help`);
}

function command(...bytes) {
  return Buffer.from(bytes);
}

function ascii(value) {
  if (!/^[\x0a\x20-\x7e]*$/.test(value)) {
    throw new Error(`Receipt contains a non-ASCII character: ${JSON.stringify(value)}`);
  }

  return Buffer.from(value, "ascii");
}

function line(value = "") {
  return ascii(`${value}\n`);
}

function center(value, width) {
  if (value.length >= width) {
    return value;
  }

  const leftPadding = Math.floor((width - value.length) / 2);
  return `${" ".repeat(leftPadding)}${value}`;
}

function wrap(value, width) {
  const output = [];

  for (const paragraph of value.split("\n")) {
    if (paragraph.length === 0) {
      output.push("");
      continue;
    }

    let currentLine = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      if (word.length > width) {
        if (currentLine) {
          output.push(currentLine);
          currentLine = "";
        }

        for (let start = 0; start < word.length; start += width) {
          output.push(word.slice(start, start + width));
        }
        continue;
      }

      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (candidate.length <= width) {
        currentLine = candidate;
      } else {
        output.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine) {
      output.push(currentLine);
    }
  }

  return output;
}

function seattleTimestamp(now = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(now);
}

function buildReceipt({ host, port, now = new Date() }) {
  const chunks = [];
  const append = (...values) => chunks.push(...values);

  append(
    command(ESC, 0x40), // Initialize printer.
    command(ESC, 0x74, 0x00), // Select code page 0, PC437.
    command(ESC, 0x4d, 0x00), // Select font A, 48 columns.
    command(ESC, 0x61, 0x01), // Center alignment.
    command(ESC, 0x45, 0x01), // Bold on.
    command(GS, 0x21, 0x11), // Double width and double height.
    line("DESK PRINTER"),
    command(GS, 0x21, 0x00),
    line("PHASE 0 HARDWARE TEST"),
    command(ESC, 0x45, 0x00),
    line(),
    command(ESC, 0x61, 0x00), // Left alignment.
    line("=".repeat(FONT_A_WIDTH)),
    line(`Target: ${host}:${port}`),
    line("Transport: raw TCP"),
    line("Command mode: ESC/POS"),
    line(`Seattle time: ${seattleTimestamp(now)}`),
    line("=".repeat(FONT_A_WIDTH)),
    line(),
    command(ESC, 0x45, 0x01),
    line("FONT A: 48-COLUMN WIDTH TEST"),
    command(ESC, 0x45, 0x00),
    line("123456789012345678901234567890123456789012345678"),
    line("|LEFT              CENTERED               RIGHT|"),
    line(),
    command(ESC, 0x4d, 0x01), // Select font B, 64 columns.
    command(ESC, 0x45, 0x01),
    line("FONT B: 64-COLUMN WIDTH TEST"),
    command(ESC, 0x45, 0x00),
    line("1234567890123456789012345678901234567890123456789012345678901234"),
    command(ESC, 0x4d, 0x00),
    line(),
  );

  for (const wrappedLine of wrap(
    "If this text is clear, both width tests reach the paper edges, and the receipt cuts below, Mac-to-printer ESC/POS communication works.",
    FONT_A_WIDTH,
  )) {
    append(line(wrappedLine));
  }

  append(
    line(),
    line("-".repeat(FONT_A_WIDTH)),
    command(ESC, 0x61, 0x01),
    command(ESC, 0x45, 0x01),
    line("END OF PHASE 0 TEST"),
    command(ESC, 0x45, 0x00),
    line("The cut command follows this feed."),
    command(ESC, 0x64, 0x05), // Feed five lines.
    command(GS, 0x56, 0x00), // Full cut.
  );

  const receipt = Buffer.concat(chunks);
  if (receipt.at(-3) !== GS || receipt.at(-2) !== 0x56 || receipt.at(-1) !== 0x00) {
    throw new Error("Receipt payload does not end with the expected full-cut command.");
  }

  return receipt;
}

function sendReceipt({ host, port, payload, timeoutMs = 5000 }) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let finished = false;

    const fail = (error) => {
      if (finished) {
        return;
      }

      finished = true;
      socket.destroy();
      reject(error);
    };

    socket.setNoDelay(true);
    socket.setTimeout(timeoutMs, () => {
      fail(new Error(`Printer connection timed out after ${timeoutMs} ms.`));
    });
    socket.on("error", fail);
    socket.on("close", (hadError) => {
      if (!finished && !hadError) {
        finished = true;
        resolve();
      }
    });
    socket.on("connect", () => {
      socket.write(payload, (error) => {
        if (error) {
          fail(error);
          return;
        }

        socket.end();
      });
    });
  });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const payload = buildReceipt(options);

  if (options.dryRun) {
    console.log(`Dry run passed: ${payload.length} ESC/POS bytes prepared for ${options.host}:${options.port}.`);
    console.log("Payload ends with full-cut command: 1d 56 00.");
    return;
  }

  await sendReceipt({ ...options, payload });
  console.log(`Sent ${payload.length} ESC/POS bytes to ${options.host}:${options.port}.`);
  console.log("Confirm that the receipt printed clearly and cut at the end.");
}

main().catch((error) => {
  console.error(`Print test failed: ${error.message}`);
  process.exitCode = 1;
});
