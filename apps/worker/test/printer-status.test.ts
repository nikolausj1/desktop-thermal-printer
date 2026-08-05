import assert from "node:assert/strict";
import test from "node:test";
import { parsePrinterStatusPage } from "../src/printer-status.js";

test("parses the RP820 status page fields", () => {
  const html = `
    <TD>Cover&nbsp;Is&nbsp;Open</TD><TD>No</TD>
    <TD>Cutter&nbsp;Error</TD><TD>No</TD>
    <TD>Paper&nbsp;End</TD><TD>No</TD>
    <TD>Paper&nbsp;Near&nbsp;End</TD><TD>Yes</TD>
    <TD>Printer&nbsp;Off-Line</TD><TD>No</TD>
  `;

  assert.deepEqual(parsePrinterStatusPage(html), {
    coverOpen: false,
    cutterError: false,
    paperEnd: false,
    paperNearEnd: true,
    printerOffline: false,
  });
});

test("returns null for status fields missing from the page", () => {
  assert.deepEqual(parsePrinterStatusPage("<html></html>"), {
    coverOpen: null,
    cutterError: null,
    paperEnd: null,
    paperNearEnd: null,
    printerOffline: null,
  });
});
