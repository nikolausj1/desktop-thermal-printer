"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

const STATUS_REFRESH_MS = 12_000;
const MESSAGE_POLL_MS = 1_500;
const MAX_MESSAGE_POLLS = 80;
const MAX_MESSAGE_LENGTH = 280;
const MAX_MESSAGE_LINE_BREAKS = 6;

type Recipient = "" | "Chase" | "Vinny";
type FeedbackState = "progress" | "success" | "error";
type FlightPhase = "idle" | "folding" | "flying" | "gone";
type DelighterConcept = "plane" | "airmail" | "hogwarts";

type PrinterStatus = {
  state: string;
  acceptingMessages: boolean;
  label: string;
  message: string;
};

type Feedback = {
  state: FeedbackState;
  mark: string;
  label: string;
  message: string;
} | null;

const initialStatus: PrinterStatus = {
  state: "checking",
  acceptingMessages: false,
  label: "Checking the message machine",
  message: "Making sure it is ready.",
};

function visibleLength(value: string) {
  return [...value].length;
}

function lineBreaks(value: string) {
  return (value.match(/\n/g) || []).length;
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return { ok: false, error: "The message machine returned an unexpected response." };
  }
}

export function PaperTelegramPage() {
  const [recipient, setRecipient] = useState<Recipient>("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [receiptDate, setReceiptDate] = useState("");
  const [stampYear, setStampYear] = useState("");
  const [printerStatus, setPrinterStatus] = useState<PrinterStatus>(initialStatus);
  const [submitting, setSubmitting] = useState(false);
  const [buttonLabel, setButtonLabel] = useState("Send this telegram");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [flight, setFlight] = useState<FlightPhase>("idle");
  const [foldStep, setFoldStep] = useState(0);
  const [returning, setReturning] = useState(false);
  const [demoAvailable, setDemoAvailable] = useState(false);
  const [concept, setConcept] = useState<DelighterConcept>("plane");

  const pickConcept = useCallback((next: DelighterConcept) => {
    setConcept(next);
    try {
      localStorage.setItem("pt-delighter-concept", next);
    } catch {
      /* private browsing */
    }
  }, []);
  const idempotencyKey = useRef<string | null>(null);
  const stampSurfaceRef = useRef<HTMLDivElement>(null);
  const flightTimers = useRef<number[]>([]);

  const clearFlightTimers = useCallback(() => {
    flightTimers.current.forEach((id) => window.clearTimeout(id));
    flightTimers.current = [];
  }, []);

  // Fold the stamp into a paper plane, step by real step, and send it off
  // the screen. Each fold shows the blank back of the paper landing over
  // the form, the way an actual dart is folded. Skipped for
  // prefers-reduced-motion, where the classic inline feedback remains.
  const launchFlight = useCallback(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    clearFlightTimers();
    setFoldStep(0);
    setFlight("folding");
    const at = (ms: number, fn: () => void) =>
      flightTimers.current.push(window.setTimeout(fn, ms));
    if (concept === "plane") {
      at(350, () => setFoldStep(1)); // top-left corner to the center line
      at(850, () => setFoldStep(2)); // top-right corner to the center line
      at(1350, () => setFoldStep(3)); // left angled edge folds in again
      at(1850, () => setFoldStep(4)); // right angled edge folds in again
      at(2400, () => setFoldStep(5)); // the dart folds in half
      at(3000, () => setFoldStep(6)); // the wings drop open
      at(3560, () => setFlight("flying")); // and it takes off
      at(4650, () => setFlight("gone"));
    } else if (concept === "airmail") {
      at(350, () => setFoldStep(1)); // bottom third folds up
      at(1050, () => setFoldStep(2)); // top third folds down over it
      at(1750, () => setFoldStep(3)); // the folded letter settles
      at(2250, () => setFoldStep(4)); // airmail markings press on
      at(3150, () => setFlight("flying")); // and off it goes
      at(4250, () => setFlight("gone"));
    } else {
      at(350, () => setFoldStep(1)); // bottom third folds up
      at(1050, () => setFoldStep(2)); // top third folds down over it
      at(1750, () => setFoldStep(3)); // the folded letter settles
      at(2250, () => setFoldStep(4)); // parchment address appears
      at(2950, () => setFoldStep(5)); // the wax seal is pressed on
      at(3650, () => setFoldStep(6)); // an owl swoops in
      at(4550, () => setFlight("flying")); // and carries it away
      at(5750, () => setFlight("gone"));
    }
  }, [clearFlightTimers, concept]);

  const bringFormBack = useCallback(() => {
    clearFlightTimers();
    setFeedback(null);
    setFlight("idle");
    setFoldStep(0);
    setReturning(true);
    flightTimers.current.push(window.setTimeout(() => setReturning(false), 700));
  }, [clearFlightTimers]);

  useEffect(() => clearFlightTimers, [clearFlightTimers]);

  // Review hook: lets the flight sequence be exercised from the console
  // without sending a real telegram to the printer. Pass a number to
  // freeze the origami at that fold step for inspection.
  useEffect(() => {
    const w = window as typeof window & {
      __ptFlightDemo?: (fail?: boolean) => void;
      __ptFoldFreeze?: (step: number) => void;
    };
    w.__ptFoldFreeze = (step: number) => {
      clearFlightTimers();
      setFlight("folding");
      setFoldStep(step);
    };
    // The on-page demo controls appear during local review, or anywhere
    // with ?review in the URL so concepts can be compared on a phone.
    // They only ever animate; nothing here can reach the printer.
    if (
      ["localhost", "127.0.0.1"].includes(window.location.hostname) ||
      new URLSearchParams(window.location.search).has("review")
    ) {
      setDemoAvailable(true);
      try {
        const saved = localStorage.getItem("pt-delighter-concept");
        if (saved === "plane" || saved === "airmail" || saved === "hogwarts") {
          setConcept(saved);
        }
      } catch {
        /* private browsing */
      }
    }
    w.__ptFlightDemo = (fail = false) => {
      launchFlight();
      window.setTimeout(() => {
        setFeedback(
          fail
            ? { state: "error", mark: "!", label: "Telegram not printed", message: "Demo failure state." }
            : {
                state: "success",
                mark: "✓",
                label: "Your paper telegram printed",
                message: "Their message is now a real piece of paper.",
              },
        );
      }, 2600);
    };
    return () => {
      delete w.__ptFlightDemo;
      delete w.__ptFoldFreeze;
    };
  }, [launchFlight, clearFlightTimers]);

  const nameValid = visibleLength(name.trim()) <= 30;
  const messageValid =
    visibleLength(message.trim()) > 0 &&
    visibleLength(message.trim()) <= MAX_MESSAGE_LENGTH &&
    lineBreaks(message.trim()) <= MAX_MESSAGE_LINE_BREAKS;
  const recipientValid = recipient !== "";
  const canSubmit =
    printerStatus.acceptingMessages &&
    recipientValid &&
    nameValid &&
    messageValid &&
    !submitting;

  // Real stamp perforations: evenly spaced semicircular bites, uniform
  // diameter and pitch, a punched hole shared at every corner. Recompute
  // from the rendered box on every resize so spacing stays regular.
  //
  // The mask is emitted as a data-URI SVG (an even-odd path with the holes
  // as subpaths) rather than a reference to an inline <mask> element,
  // because Safari, including every iPhone, ignores mask-image: url(#id).
  useEffect(() => {
    const surface = stampSurfaceRef.current;
    if (!surface) return;

    function buildPerforationMask() {
      if (!surface) return;
      const w = Math.round(surface.clientWidth);
      const h = Math.round(surface.clientHeight);
      if (!w || !h) return;

      const targetSpacing = 19;
      let hScallops = Math.max(4, Math.round(w / targetSpacing));
      if (hScallops % 2 !== 0) hScallops += 1;
      let vScallops = Math.max(4, Math.round(h / targetSpacing));
      if (vScallops % 2 !== 0) vScallops += 1;

      const hPitch = w / hScallops;
      const vPitch = h / vScallops;
      let radius = Math.min(hPitch, vPitch) * 0.34;
      radius = Math.max(4, Math.min(8, radius));
      const r = radius.toFixed(2);

      const circle = (cx: number, cy: number) => {
        const x = (cx - radius).toFixed(2);
        return `M${x},${cy.toFixed(2)} a${r},${r} 0 1,0 ${(radius * 2).toFixed(2)},0 a${r},${r} 0 1,0 ${(-radius * 2).toFixed(2)},0 z`;
      };

      let d = `M0,0 H${w} V${h} H0 z`;
      for (let i = 0; i <= hScallops; i += 1) {
        d += circle(i * hPitch, 0);
        d += circle(i * hPitch, h);
      }
      for (let j = 1; j < vScallops; j += 1) {
        d += circle(0, j * vPitch);
        d += circle(w, j * vPitch);
      }

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${d}" fill="#000" fill-rule="evenodd"/></svg>`;
      const uri = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
      surface.style.webkitMaskImage = uri;
      surface.style.maskImage = uri;
      surface.style.webkitMaskSize = "100% 100%";
      surface.style.maskSize = "100% 100%";
    }

    buildPerforationMask();
    if (document.fonts?.ready) {
      void document.fonts.ready.then(buildPerforationMask);
    }
    const observer = new ResizeObserver(buildPerforationMask);
    observer.observe(surface);
    return () => observer.disconnect();
  }, []);

  const refreshPrinterStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/printer/status", {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      const payload = await readJson(response);
      if (!response.ok || payload.ok !== true) throw new Error("Status unavailable");

      const accepting = payload.acceptingMessages === true;
      const online = payload.status === "online" && accepting;
      const nextStatus: PrinterStatus = {
        state: online ? "online" : payload.status || "offline",
        acceptingMessages: accepting,
        label: online ? "Message machine online" : payload.label || "Message machine unavailable",
        message: online
          ? "Ready for a new telegram."
          : payload.message || "New telegrams are temporarily unavailable.",
      };
      setPrinterStatus(nextStatus);
      return nextStatus;
    } catch {
      const unavailable: PrinterStatus = {
        state: "error",
        acceptingMessages: false,
        label: "Status unavailable",
        message: "The message machine could not be checked right now.",
      };
      setPrinterStatus(unavailable);
      return unavailable;
    }
  }, []);

  useEffect(() => {
    const now = new Date();
    setReceiptDate(
      new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
        .format(now)
        .toUpperCase(),
    );
    setStampYear(String(now.getFullYear()));
    void refreshPrinterStatus();
    const timer = window.setInterval(() => {
      if (!submitting) void refreshPrinterStatus();
    }, STATUS_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refreshPrinterStatus, submitting]);

  const resetSubmission = useCallback(() => {
    setSubmitting(false);
    setButtonLabel("Send this telegram");
  }, []);

  const pollMessageStatus = useCallback(
    async (messageId: string, telegramRecipient: Exclude<Recipient, "">) => {
      for (let attempt = 0; attempt < MAX_MESSAGE_POLLS; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, MESSAGE_POLL_MS));
        try {
          const response = await fetch(`/api/printer/messages/${encodeURIComponent(messageId)}`, {
            headers: { accept: "application/json" },
            cache: "no-store",
          });
          const payload = await readJson(response);
          if (!response.ok || payload.ok !== true) continue;

          if (payload.status === "printing") {
            setFeedback({
              state: "progress",
              mark: "02",
              label: "The machine picked it up",
              message: `Printing a paper telegram for ${telegramRecipient}.`,
            });
          } else if (payload.status === "sent_to_printer") {
            setFeedback({
              state: "success",
              mark: "✓",
              label: "Your paper telegram printed",
              message: `${telegramRecipient}'s message is now a real piece of paper.`,
            });
          } else if (payload.terminal === true) {
            setFeedback({
              state: "error",
              mark: "!",
              label: payload.label || "Telegram not printed",
              message: payload.message || "The message machine could not print this telegram.",
            });
          } else {
            setFeedback({
              state: "progress",
              mark: "01",
              label: "Telegram received",
              message: "Waiting for the message machine.",
            });
          }

          if (payload.terminal === true) {
            idempotencyKey.current = null;
            if (payload.status === "sent_to_printer") {
              setRecipient("");
              setName("");
              setMessage("");
              setWebsite("");
              setShowErrors(false);
            }
            await refreshPrinterStatus();
            resetSubmission();
            return;
          }
        } catch {
          // A later poll may recover. Never resubmit while polling.
        }
      }

      setFeedback({
        state: "progress",
        mark: "…",
        label: "Still waiting for an update",
        message: "Your telegram was received, but this page could not confirm the final print status.",
      });
      resetSubmission();
    },
    [refreshPrinterStatus, resetSubmission],
  );

  async function submitTelegram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowErrors(true);
    if (!canSubmit) return;

    const telegramRecipient = recipient as Exclude<Recipient, "">;
    setSubmitting(true);
    setButtonLabel("Checking the machine...");
    setFeedback({
      state: "progress",
      mark: "00",
      label: "Sending your paper telegram",
      message: "Checking that the message machine is ready.",
    });

    const latestStatus = await refreshPrinterStatus();
    if (!latestStatus.acceptingMessages) {
      setFeedback({
        state: "error",
        mark: "!",
        label: latestStatus.label,
        message: latestStatus.message,
      });
      resetSubmission();
      return;
    }

    idempotencyKey.current ||= crypto.randomUUID();
    setButtonLabel("Sending your telegram...");

    try {
      const response = await fetch("/api/printer/messages", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name,
          message: `FOR ${telegramRecipient.toUpperCase()}\n\n${message}`,
          idempotencyKey: idempotencyKey.current,
          website,
        }),
      });
      const payload = await readJson(response);

      if (!response.ok || payload.ok !== true) {
        setFeedback({
          state: "error",
          mark: "!",
          label: "Telegram not sent",
          message: payload.error || "Your telegram could not be sent. Please try again.",
        });
        if (response.status < 500) idempotencyKey.current = null;
        resetSubmission();
        return;
      }

      setFeedback({
        state: "progress",
        mark: "01",
        label: "Telegram received",
        message: "Waiting for the message machine.",
      });
      launchFlight();
      await pollMessageStatus(payload.messageId, telegramRecipient);
    } catch {
      setFeedback({
        state: "error",
        mark: "!",
        label: "Connection interrupted",
        message: "Your telegram may have arrived. Press the button again to safely check without printing twice.",
      });
      resetSubmission();
    }
  }

  const recipientError = showErrors && !recipientValid ? "Choose Vinny or Chase." : "";
  const nameError = showErrors && !nameValid ? "Use 30 characters or fewer." : "";
  const messageError =
    showErrors && !message.trim()
      ? "Write a telegram first."
      : showErrors && lineBreaks(message.trim()) > MAX_MESSAGE_LINE_BREAKS
        ? `Use ${MAX_MESSAGE_LINE_BREAKS} line breaks or fewer.`
        : showErrors && visibleLength(message.trim()) > MAX_MESSAGE_LENGTH
          ? `Use ${MAX_MESSAGE_LENGTH} characters or fewer.`
          : "";

  return (
    <div className="page-shell">
      {concept === "hogwarts" &&
      ((flight === "folding" && foldStep >= 6) || flight === "flying") ? (
        <div className="owl-flyover" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="owl-f1" src="/owl-top-1.png" alt="" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="owl-f2" src="/owl-top-2.png" alt="" />
        </div>
      ) : null}

      {demoAvailable ? (
        <>
          <div className="concept-switch" role="group" aria-label="Delighter concept">
            {(
              [
                ["plane", "✈ Plane"],
                ["airmail", "✉ Airmail"],
                ["hogwarts", "🦉 Hogwarts"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={concept === key}
                onClick={() => {
                  pickConcept(key);
                  bringFormBack();
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="demo-button"
            onClick={() => {
              const w = window as typeof window & { __ptFlightDemo?: () => void };
              bringFormBack();
              window.setTimeout(() => w.__ptFlightDemo?.(), 750);
            }}
          >
            ▶ Preview the send animation
          </button>
        </>
      ) : null}

      <main className="main-layout">
        <section className="hero-col" aria-labelledby="page-title">
          <p className="brandline">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-plane-white.png" alt="" />
            Paper Telegram
          </p>
          <p className="eyebrow">A real message, on real paper</p>
          <h1 id="page-title">Send Vinny &amp; Chase a paper telegram.</h1>
          <p className="lede">
            Type a note here and a tiny printer in their house wakes up and prints it on real
            paper. No screens on their end, no accounts, no apps. Just a message they can hold.
          </p>
          <p className="nostalgia">
            For everyone who remembers when getting mail was the best part of the day.
          </p>

          <p className="status-chip" data-state={printerStatus.state} role="status" aria-live="polite">
            <span className="status-dot" aria-hidden="true" />
            <span className="status-text">
              <strong>{printerStatus.label}</strong>
              <small>{printerStatus.message}</small>
            </span>
          </p>
        </section>

        <section className="stamp-col" aria-labelledby="form-title">
          {flight === "flying" ? (
            <svg className="contrail" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path
                d="M50,46 Q60,28 86,4 T160,-70"
                pathLength={100}
                fill="none"
                stroke="rgba(248, 245, 236, 0.55)"
                strokeWidth="0.7"
                strokeDasharray="2.6 3.4"
              />
            </svg>
          ) : null}

          <div className="stamp-stage" data-flight={flight} data-step={foldStep} data-concept={concept}>
            {(flight === "folding" || flight === "flying") && concept === "plane" ? (
              <div className="fold-theater" aria-hidden="true">
                <div className="fold-flap flap-tl" />
                <div className="fold-flap flap-tr" />
                <div className="fold-flap flap-l2" />
                <div className="fold-flap flap-r2" />
                <div className="fold-half" />
                <div className="plane-final" aria-hidden="true">
                  <div className="plane-wing-far" />
                  <div className="plane-keel" />
                  <div className="plane-wing-near" />
                </div>
              </div>
            ) : null}

            {(flight === "folding" || flight === "flying") && concept !== "plane" ? (
              <div className="fold-theater" aria-hidden="true">
                <div className="fold-flap env-bottom" />
                <div className="fold-flap env-top" />
                <div className={`env-face${concept === "hogwarts" ? " hogwarts" : ""}`}>
                  {concept === "airmail" ? (
                    <>
                      <div className="env-stamp">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/logo-plane.png" alt="" />
                      </div>
                      <p className="env-address">
                        <span>To: {recipient || "Vinny & Chase"}</span>
                        <span>A desk in Seattle</span>
                      </p>
                      <span className="env-par-avion">Par Avion</span>
                    </>
                  ) : (
                    <>
                      <div className="env-flap-creases" />
                      <p className="env-for">For {recipient || "Vinny & Chase"}</p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="env-crest" src="/logo-plane.png" alt="" />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="wax-seal" src="/wax-seal.png" alt="" />
                    </>
                  )}
                </div>
              </div>
            ) : null}

            {flight === "gone" ? (
              <div className="flight-card" role="status" aria-live="polite">
                <p className="flight-kicker">Paper Telegram &middot; In transit</p>
                <div className="flight-line" data-state={feedback?.state || "progress"}>
                  <span className="feedback-mark" aria-hidden="true">
                    {feedback?.mark || "01"}
                  </span>
                  <div>
                    <strong>{feedback?.label || "Telegram received"}</strong>
                    <p>{feedback?.message || "Waiting for the message machine."}</p>
                  </div>
                </div>
                {feedback?.state === "success" ? (
                  <button type="button" className="send-btn flight-again" onClick={bringFormBack}>
                    <span>Send another telegram</span>
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M4 12H20M20 12L14 6M20 12L14 18"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                ) : null}
                {feedback?.state === "error" ? (
                  <button type="button" className="send-btn flight-again" onClick={bringFormBack}>
                    <span>Bring the form back</span>
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M20 12H4M4 12L10 6M4 12L10 18"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                ) : null}
                <svg
                  className={`postmark-fresh card-postmark${feedback?.state === "success" ? " stamped" : ""}`}
                  aria-hidden="true"
                  viewBox="0 0 200 200"
                >
                  <circle cx="100" cy="100" r="72" fill="none" stroke="var(--navy-ink)" strokeWidth="2.5" />
                  <circle cx="100" cy="100" r="61" fill="none" stroke="var(--navy-ink)" strokeWidth="1.2" />
                  <path
                    className="wave"
                    d="M18,96 q7,-11 14,0 t14,0 t14,0 t14,0 t14,0 t14,0 t14,0 t14,0 t14,0 t14,0"
                    fill="none"
                    stroke="var(--navy-ink)"
                    strokeWidth="1.6"
                    opacity="0.85"
                  />
                  <path
                    className="wave"
                    d="M14,109 q7,-11 14,0 t14,0 t14,0 t14,0 t14,0 t14,0 t14,0 t14,0 t14,0 t14,0"
                    fill="none"
                    stroke="var(--navy-ink)"
                    strokeWidth="1.6"
                    opacity="0.7"
                  />
                </svg>
              </div>
            ) : null}

            <div
              className={`giant-stamp${
                flight === "folding" || flight === "flying" ? " origami" : ""
              }${flight === "gone" ? " folded" : ""}${returning ? " unfolding" : ""}`}
            >
              <div className="stamp-surface" ref={stampSurfaceRef}>
                <span className="stamp-corner tl" aria-hidden="true">
                  1<small>Smile</small>
                </span>
                <span className="stamp-corner tr" aria-hidden="true">
                  {stampYear}
                </span>

                <div className="stripe-frame">
                  <div className="stripe-edge stripe-top" aria-hidden="true" />
                  <div className="stripe-edge stripe-bottom" aria-hidden="true" />
                  <div className="stripe-edge stripe-left" aria-hidden="true" />
                  <div className="stripe-edge stripe-right" aria-hidden="true" />

                  <div className="frame-content">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="watermark-plane" src="/logo-plane.png" alt="" aria-hidden="true" />

                    <form className="telegram" onSubmit={submitTelegram} noValidate>
                      <div className="meta-row" aria-hidden="true">
                        <span>PT / MESSAGE 01</span>
                        <span>48 COL</span>
                      </div>

                      <div className="heading-block">
                        <span className="kicker">Paper Telegram</span>
                        <h2 id="form-title">{recipient ? `For ${recipient}` : "Special delivery"}</h2>
                      </div>

                      <fieldset aria-describedby="recipient-error">
                        <legend>Who gets this telegram?</legend>
                        <div className="recipient-grid">
                          {(["Vinny", "Chase"] as const).map((child) => (
                            <label key={child} className="chip">
                              <input
                                className="sr-only"
                                type="radio"
                                name="recipient"
                                value={child}
                                checked={recipient === child}
                                onChange={() => setRecipient(child)}
                              />
                              <span>{child}</span>
                            </label>
                          ))}
                        </div>
                        <small className="field-error" id="recipient-error" aria-live="polite">
                          {recipientError}
                        </small>
                      </fieldset>

                      <div className="field">
                        <div className="field-label-row">
                          <label htmlFor="sender-name">Your name</label>
                          <span className="field-tag">Optional</span>
                        </div>
                        <input
                          id="sender-name"
                          name="name"
                          type="text"
                          maxLength={30}
                          autoComplete="name"
                          placeholder="Harry Potter"
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          aria-describedby="name-help name-error"
                        />
                        <small className="field-helper" id="name-help">
                          So they know who sent it.
                        </small>
                        <small className="field-error" id="name-error" aria-live="polite">
                          {nameError}
                        </small>
                      </div>

                      <div className="field">
                        <div className="field-label-row">
                          <label htmlFor="message-text">Your message</label>
                          <span className="field-counter" data-warning={visibleLength(message) >= 250}>
                            {visibleLength(message)} / {MAX_MESSAGE_LENGTH}
                          </span>
                        </div>
                        <textarea
                          id="message-text"
                          name="message"
                          maxLength={MAX_MESSAGE_LENGTH}
                          rows={6}
                          required
                          placeholder="A joke, a hello, or something worth keeping..."
                          value={message}
                          onChange={(event) => setMessage(event.target.value)}
                          aria-describedby="message-help message-error"
                        />
                        <small className="field-helper" id="message-help">
                          Plain text only. Up to 6 line breaks.
                        </small>
                        <small className="field-error" id="message-error" aria-live="polite">
                          {messageError}
                        </small>
                      </div>

                      <div className="trap-field" aria-hidden="true">
                        <label htmlFor="website">Website</label>
                        <input
                          id="website"
                          name="website"
                          type="text"
                          tabIndex={-1}
                          autoComplete="off"
                          value={website}
                          onChange={(event) => setWebsite(event.target.value)}
                        />
                      </div>

                      <button type="submit" className="send-btn" disabled={!canSubmit}>
                        <span>{buttonLabel}</span>
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path
                            d="M4 12H20M20 12L14 6M20 12L14 18"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>

                      {feedback && flight === "idle" ? (
                        <div
                          className="submission-feedback"
                          data-state={feedback.state}
                          role="status"
                          aria-live="polite"
                        >
                          <span className="feedback-mark" aria-hidden="true">
                            {feedback.mark}
                          </span>
                          <div>
                            <strong>{feedback.label}</strong>
                            <p>{feedback.message}</p>
                          </div>
                        </div>
                      ) : null}

                      <div className="form-footer" aria-hidden="true">
                        <span className="footer-brand">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/logo-plane.png" alt="" />
                          PAPERTELEGRAM.COM
                        </span>
                        <span>{receiptDate}</span>
                      </div>
                    </form>

                    <p className="frame-caption">Paper Telegram &middot; Par Avion</p>
                  </div>
                </div>

                <svg
                  className={`postmark-fresh${feedback?.state === "success" ? " stamped" : ""}`}
                  aria-hidden="true"
                  viewBox="0 0 200 200"
                >
                  <defs>
                    <path id="pmPath" d="M100,39 A61,61 0 1,1 99.9,39" fill="none" />
                  </defs>
                  <circle cx="100" cy="100" r="72" fill="none" stroke="var(--navy-ink)" strokeWidth="2.5" />
                  <circle cx="100" cy="100" r="61" fill="none" stroke="var(--navy-ink)" strokeWidth="1.2" />
                  <text fontFamily="var(--mono)" fontSize="10.5" letterSpacing="2.5" fill="var(--navy-ink)">
                    <textPath href="#pmPath" startOffset="1">
                      PAPER TELEGRAM &middot; DELIVERED &middot; PAPER TELEGRAM &middot; DELIVERED
                    </textPath>
                  </text>
                  <path
                    className="wave"
                    d="M18,96 q7,-11 14,0 t14,0 t14,0 t14,0 t14,0 t14,0 t14,0 t14,0 t14,0 t14,0"
                    fill="none"
                    stroke="var(--navy-ink)"
                    strokeWidth="1.6"
                    opacity="0.85"
                  />
                  <path
                    className="wave"
                    d="M14,109 q7,-11 14,0 t14,0 t14,0 t14,0 t14,0 t14,0 t14,0 t14,0 t14,0 t14,0"
                    fill="none"
                    stroke="var(--navy-ink)"
                    strokeWidth="1.6"
                    opacity="0.7"
                  />
                  <path
                    className="wave"
                    d="M22,123 q7,-11 14,0 t14,0 t14,0 t14,0 t14,0 t14,0 t14,0 t14,0 t14,0"
                    fill="none"
                    stroke="var(--navy-ink)"
                    strokeWidth="1.4"
                    opacity="0.55"
                  />
                </svg>
              </div>
            </div>
          </div>
        </section>
      </main>

      <section className="project-story" aria-labelledby="story-title">
        <div className="story-intro">
          <div>
            <p className="story-eyebrow">The idea</p>
            <h2 id="story-title">A little message machine for Vinny and Chase</h2>
          </div>
          <p className="story-lede">
            Most messages disappear into an inbox. Paper Telegram turns a few words from someone
            they know into something Vinny or Chase can pick up, read, and keep.
          </p>
        </div>

        <ol className="system-flow" aria-label="How a paper telegram reaches the printer">
          <li>
            <span className="flow-number">01</span>
            <h3>Pick who gets it</h3>
            <p>Choose Vinny or Chase so the message machine knows who the telegram belongs to.</p>
            <span className="flow-tech">Address it</span>
          </li>
          <li>
            <span className="flow-number">02</span>
            <h3>Write a quick note</h3>
            <p>Send a hello, a joke, a riddle, or a few words you want them to remember.</p>
            <span className="flow-tech">Type it</span>
          </li>
          <li>
            <span className="flow-number">03</span>
            <h3>The internet carries it</h3>
            <p>The telegram waits safely in the cloud until the printer at our house is ready.</p>
            <span className="flow-tech">Deliver it</span>
          </li>
          <li>
            <span className="flow-number">04</span>
            <h3>The machine makes it real</h3>
            <p>A small printer wakes up, puts the message on paper, and cuts the telegram.</p>
            <span className="flow-tech">Keep it</span>
          </li>
        </ol>

        <div className="build-story">
          <div className="build-copy">
            <p className="story-eyebrow">How it was made</p>
            <p>
              I found an old thermal printer with an Ethernet port and wondered if I could connect
              it to the internet. After getting it to print from my Mac, I built a cloud queue where
              each incoming telegram waits until the printer is ready. A small program on an
              always-on computer at our house retrieves the next message, turns it into printer
              commands, and sends it across our home network.
            </p>
            <p>
              The result is deliberately simple: family and friends write on a screen, while Vinny
              and Chase receive a real piece of paper.
            </p>
          </div>

          <aside className="technical-card" aria-labelledby="technical-title">
            <p className="technical-label">For the curious</p>
            <h3 id="technical-title">What is under the hood</h3>
            <dl>
              <div>
                <dt>Website</dt>
                <dd>Next.js and TypeScript</dd>
              </div>
              <div>
                <dt>Cloud</dt>
                <dd>Supabase Edge Functions and Postgres</dd>
              </div>
              <div>
                <dt>Home worker</dt>
                <dd>Node.js running as a Windows service</dd>
              </div>
              <div>
                <dt>Printer link</dt>
                <dd>Raw TCP over Ethernet using ESC/POS</dd>
              </div>
            </dl>
            <p className="technical-note">
              Each telegram is rate-limited, checked, queued once, and accepted only while the
              message machine reports that it is healthy.
            </p>
          </aside>
        </div>
      </section>

      <footer className="site-footer">
        <p>papertelegram.com &middot; a tiny press for two kids</p>
        <p>Built by their dad, with an unreasonable amount of infrastructure for a tiny printer.</p>
      </footer>
    </div>
  );
}
