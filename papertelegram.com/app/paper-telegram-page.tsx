"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

const STATUS_REFRESH_MS = 12_000;
const MESSAGE_POLL_MS = 1_500;
const MAX_MESSAGE_POLLS = 80;
const MAX_MESSAGE_LENGTH = 280;
const MAX_MESSAGE_LINE_BREAKS = 6;

type Recipient = "" | "Chase" | "Vinny";
type FeedbackState = "progress" | "success" | "error";

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
  const [printerStatus, setPrinterStatus] = useState<PrinterStatus>(initialStatus);
  const [submitting, setSubmitting] = useState(false);
  const [buttonLabel, setButtonLabel] = useState("Send this telegram");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [showErrors, setShowErrors] = useState(false);
  const idempotencyKey = useRef<string | null>(null);

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
        state: payload.status || "offline",
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
    setReceiptDate(
      new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
        .format(new Date())
        .toUpperCase(),
    );
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
    if (!canSubmit || recipient === "") return;

    const telegramRecipient = recipient;
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

  const recipientError = showErrors && !recipientValid ? "Choose Chase or Vinny." : "";
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
      <main className="main-layout">
        <section className="intro" aria-labelledby="page-title">
          <p className="eyebrow">Papertelegram.com</p>
          <h1 id="page-title">Send Chase or Vinny a paper telegram.</h1>
          <p className="lede">
            Write them a quick hello, joke, riddle, or note in the receipt{" "}
            <span className="lede-direction-wide">to the right</span>
            <span className="lede-direction-stacked">below</span>. It will travel across the
            internet and come out of their little message machine as a real piece of paper.
          </p>

          <div
            className="printer-status"
            data-state={printerStatus.state}
            role="status"
            aria-live="polite"
          >
            <span className="status-light" aria-hidden="true" />
            <span>
              <strong>{printerStatus.label}</strong>
              <small>{printerStatus.message}</small>
            </span>
          </div>
        </section>

        <section className="receipt-wrap" aria-labelledby="form-title">
          <div className="receipt">
            <div className="receipt-meta" aria-hidden="true">
              <span>PT / MESSAGE 01</span>
              <span>48 COL</span>
            </div>

            <div className="receipt-heading">
              <p>Paper Telegram</p>
              <h2 id="form-title">{recipient ? `For ${recipient}` : "Special delivery"}</h2>
            </div>

            <form onSubmit={submitTelegram} noValidate>
              <fieldset className="recipient-fieldset" aria-describedby="recipient-error">
                <legend>Who gets this telegram?</legend>
                <div className="recipient-options">
                  {(["Chase", "Vinny"] as const).map((child) => (
                    <label key={child} className={recipient === child ? "is-selected" : ""}>
                      <input
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

              <div className="field-group">
                <div className="label-row">
                  <label htmlFor="sender-name">Your name</label>
                  <span>Optional</span>
                </div>
                <input
                  id="sender-name"
                  name="name"
                  type="text"
                  maxLength={30}
                  autoComplete="name"
                  placeholder="Aunt Jane"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  aria-describedby="name-help name-error"
                />
                <small id="name-help">So they know who sent it.</small>
                <small className="field-error" id="name-error" aria-live="polite">
                  {nameError}
                </small>
              </div>

              <div className="field-group">
                <div className="label-row">
                  <label htmlFor="message-text">Your message</label>
                  <span data-warning={visibleLength(message) >= 250}>
                    {visibleLength(message)} / {MAX_MESSAGE_LENGTH}
                  </span>
                </div>
                <textarea
                  id="message-text"
                  name="message"
                  maxLength={MAX_MESSAGE_LENGTH}
                  rows={7}
                  required
                  placeholder="A joke, a hello, or something worth keeping..."
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  aria-describedby="message-help message-error"
                />
                <small id="message-help">Plain text only. Up to 6 line breaks.</small>
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

              <button type="submit" disabled={!canSubmit}>
                <span>{buttonLabel}</span>
                <span className="button-arrow" aria-hidden="true">→</span>
              </button>

              {feedback ? (
                <div
                  className="submission-feedback"
                  data-state={feedback.state}
                  role="status"
                  aria-live="polite"
                >
                  <span className="feedback-mark" aria-hidden="true">{feedback.mark}</span>
                  <div>
                    <strong>{feedback.label}</strong>
                    <p>{feedback.message}</p>
                  </div>
                </div>
              ) : null}
            </form>

            <div className="receipt-footer" aria-hidden="true">
              <span>PAPERTELEGRAM.COM</span>
              <span>{receiptDate}</span>
            </div>
          </div>

          <aside className="desk-note">
            <p>A real printer. A real piece of paper. A message just for them.</p>
          </aside>
        </section>
      </main>

      <section className="project-story" aria-labelledby="story-title">
        <div className="story-intro">
          <div>
            <p className="story-eyebrow">The idea</p>
            <h2 id="story-title">A little message machine for Chase and Vinny</h2>
          </div>
          <p className="story-lede">
            Most messages disappear into an inbox. Paper Telegram turns a few words from someone
            they know into something Chase or Vinny can pick up, read, and keep.
          </p>
        </div>

        <ol className="system-flow" aria-label="How a paper telegram reaches the printer">
          <li>
            <span className="flow-number">01</span>
            <h3>Pick who gets it</h3>
            <p>Choose Chase or Vinny so the message machine knows who the telegram belongs to.</p>
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
              The result is deliberately simple: family and friends write on a screen, while Chase
              and Vinny receive a real piece of paper.
            </p>
          </div>

          <aside className="technical-card" aria-labelledby="technical-title">
            <p className="technical-label">For the curious</p>
            <h3 id="technical-title">What is under the hood</h3>
            <dl>
              <div><dt>Website</dt><dd>Next.js and TypeScript</dd></div>
              <div><dt>Cloud</dt><dd>Supabase Edge Functions and Postgres</dd></div>
              <div><dt>Home worker</dt><dd>Node.js running as a Windows service</dd></div>
              <div><dt>Printer link</dt><dd>Raw TCP over Ethernet using ESC/POS</dd></div>
            </dl>
            <p className="technical-note">
              Each telegram is rate-limited, checked, queued once, and accepted only while the
              message machine reports that it is healthy.
            </p>
          </aside>
        </div>
      </section>

      <footer className="site-footer">
        <p>Built by their dad, with an unreasonable amount of infrastructure for a tiny printer.</p>
      </footer>
    </div>
  );
}
