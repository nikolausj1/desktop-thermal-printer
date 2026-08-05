# Internet-Connected Desk Printer
## Product Requirements Document

**Status:** Initial build specification  
**Version:** 1.0  
**Date:** August 4, 2026  
**Owner:** Justin Nikolaus  

---

## 1. Product Summary

Build a public website that lets anyone send a short text message to a physical Rongta RP820 thermal receipt printer located on Justin’s desk.

The website should show whether the printer is currently available. When the printer is online, a visitor can enter an optional name and a message, then press a button to print it. The message should travel through a cloud-hosted queue to a small background service running on Justin’s existing Windows home server. That service sends the message to the printer over the local Ethernet network using ESC/POS commands.

The primary experience is immediate and physical:

1. A visitor sees that the printer is online.
2. The visitor writes a message.
3. The visitor presses **Print this message**.
4. The website shows the message moving through the print process.
5. A physical receipt prints on Justin’s desk.
6. The website confirms that the job was sent successfully.

This first version focuses only on messages submitted through the website. SMS, automated system messages, images, replies, and other integrations are deferred.

---

## 2. Product Vision

Create a small, understandable internet-connected object that gives remote visitors the feeling that they caused something physical to happen in another location.

The product should feel personal, direct, and slightly unusual, not like a generic contact form or public message board.

Suggested positioning:

> Type a message below and it will print on a small thermal printer sitting on my desk in Seattle.

The project should be simple enough to build and operate as a personal proof of concept, but its architecture should support later additions such as Twilio SMS, private send links, scheduled messages, reactions, or other message sources.

---

## 3. Goals

### 3.1 Primary goals

- Let a public website visitor send a short text message to the desk printer.
- Show an accurate, understandable printer status before submission.
- Print accepted messages within a few seconds under normal conditions.
- Give the sender clear feedback throughout the process.
- Prevent direct public access to the home server or printer.
- Provide Justin with basic controls to pause, inspect, retry, or block printing.
- Keep the first version small enough to build quickly.

### 3.2 Secondary goals

- Make the printout visually intentional and recognizable.
- Create a reliable queue so messages are not duplicated or lost during normal failures.
- Collect enough operational information to troubleshoot the system.
- Make later SMS integration straightforward by using a shared message and print-job model.

### 3.3 Non-goals for V1

V1 will not include:

- SMS or MMS input
- Email input
- Automated alerts or system messages
- User accounts
- Public message history
- Public comments or replies
- Images, drawings, GIFs, or photos
- Rich-text formatting
- Scheduled messages
- Location collection
- Public webcam or printer camera
- Native iOS or Android apps
- Browser extensions
- Multiple printers
- Guaranteed physical paper verification
- Complex AI-generated content

---

## 4. Hardware and Existing Environment

### 4.1 Printer

- **Model:** Rongta RP820
- **Paper:** 80 mm thermal receipt paper
- **Connectivity:** Ethernet
- **Protocol:** ESC/POS
- **Expected network printing method:** Raw TCP, commonly port 9100
- **Features:** Automatic cutter, monochrome thermal printing

The exact network port and supported status-query commands should be confirmed during hardware setup.

### 4.2 Home server

An existing Windows computer currently runs Plex and will also run the local print worker.

The print worker should:

- Run independently of Plex.
- Start automatically after Windows restarts.
- Operate without a logged-in desktop session if practical.
- Make outbound connections to the cloud.
- Reach the printer through the home LAN.
- Never require inbound public internet access.

### 4.3 Network

- Printer connects by Ethernet to the switch at Justin’s desk.
- Home server and printer are on the same local network.
- Printer should receive a DHCP reservation or static local IP.
- No router port forwarding should be used.
- Printer port 9100, or the confirmed equivalent, must remain LAN-only.

---

## 5. Target Users

### 5.1 Public sender

A friend, family member, coworker, social follower, or stranger who receives or discovers the public website URL.

They want to:

- Understand what the site does immediately.
- Know whether the printer is available.
- Send a message with minimal effort.
- Know whether the message was accepted and sent to the printer.

They should not need an account.

### 5.2 Owner and administrator

Justin manages the printer and service.

He needs to:

- See the real system status.
- Pause or resume new submissions.
- Review recent print jobs.
- Retry or delete failed jobs.
- Send a test print.
- Block abusive senders.
- Diagnose worker or printer failures.
- Avoid unexpected delayed printing.

---

## 6. Core User Experience

### 6.1 Public landing page

The landing page should contain:

1. Project title
2. One-sentence explanation
3. Current printer status
4. Optional sender name field
5. Required message field
6. Character counter
7. Primary **Print this message** button
8. Brief privacy and behavior explanation
9. Success or error feedback after submission

Suggested page copy:

# Send a Message to My Desk

> Type a message below and it will print on a small thermal printer sitting on my desk in Seattle.

Supporting text:

> Messages are not displayed publicly. Anything you submit may be physically visible to people near the printer.

### 6.2 Form fields

#### Name

- Optional
- Maximum 30 characters
- Label: **Your name or nickname**
- Helper text: **Optional. Leave blank to send anonymously.**
- Plain text only

#### Message

- Required
- Maximum 300 characters
- Minimum 1 visible, non-whitespace character
- Line breaks allowed
- Excessive blank lines collapsed or rejected
- Plain text only
- HTML escaped
- Character counter shown while typing

### 6.3 Primary button

Preferred label:

**Print this message**

Do not use generic labels such as “Submit” as the primary action.

The button should be disabled when:

- Printer status is offline
- Printing is paused
- Status cannot be confirmed
- Message is empty
- Message exceeds the limit
- A submission is already in progress

### 6.4 Submission states

The sender should see clear progression:

1. **Sending your message…**
2. **Message received. Waiting for the printer…**
3. **Printing on Justin’s desk…**
4. **Your message was sent to the printer.**

Because the printer may not provide perfect physical paper confirmation, the system should avoid claiming absolute proof unless reliable printer status feedback is available.

Recommended success language for V1:

> Your message was sent to the printer successfully.

A more playful secondary line may say:

> It should now be sitting on Justin’s desk.

### 6.5 Failure states

Examples:

- **The printer went offline before your message could be printed.**
- **The printer is temporarily unavailable. Nothing was printed.**
- **Your message could not be sent. Please try again.**
- **Too many messages have been sent from this connection. Try again later.**
- **This message could not be accepted.**
- **The printer has reached its daily message limit.**

Failures should not expose internal errors, IP addresses, stack traces, service names, or network details.

---

## 7. Printer Status

### 7.1 Purpose

Printer status should indicate whether a message submitted now is likely to be processed immediately.

It should not merely indicate that the public website is running.

### 7.2 Public states

#### Online

Meaning:

- Windows print worker has checked in recently.
- Worker can reach the printer.
- New submissions are enabled.
- Queue is operating normally.

Public display:

> **Printer online**  
> Ready to print now.

#### Busy

Meaning:

- System is healthy.
- One or more messages are currently processing.
- New submissions may still be accepted.

Public display:

> **Printer busy**  
> Your message will be added to the short queue.

Busy may be omitted from the first implementation if expected traffic is very low.

#### Offline

Meaning:

- Worker heartbeat is stale, or
- Printer cannot be reached, or
- System health cannot be confirmed.

Public display:

> **Printer offline**  
> New messages are temporarily unavailable.

The form should be disabled.

#### Paused

Meaning:

- Justin has manually disabled new public submissions.

Public display:

> **Messages paused**  
> The printer is not accepting new messages right now.

### 7.3 Status calculation

Recommended starting values:

- Worker heartbeat every 15 seconds
- Worker considered stale after 45 seconds
- Website refreshes public status every 10 to 15 seconds
- Website rechecks status immediately before accepting a message

The worker heartbeat should report:

- Worker online
- Printer network reachability
- Whether submissions are enabled
- Queue length
- Last successful worker check-in
- Last successful print time
- Current worker version
- Optional diagnostic error code

The public API should expose only a simplified status.

Example internal heartbeat:

```json
{
  "workerOnline": true,
  "printerReachable": true,
  "acceptingMessages": true,
  "queueLength": 0,
  "lastHeartbeatAt": "2026-08-04T18:45:30Z",
  "lastPrintAt": "2026-08-04T18:42:11Z",
  "workerVersion": "1.0.0"
}
```

Example public response:

```json
{
  "status": "online",
  "label": "Printer online",
  "message": "Ready to print now."
}
```

### 7.4 Offline submission behavior

For V1, do not accept new public messages while the printer is offline or paused.

This prevents:

- Old messages printing unexpectedly later
- Large offline backlogs
- Confusion about delivery timing
- Additional queue-expiration logic

A message accepted while the system is online may remain queued briefly if the printer fails during processing. It should expire rather than print much later.

Recommended V1 expiration:

- 15 minutes after submission

Expired jobs should be marked expired and should not print automatically.

---

## 8. Printed Receipt Design

### 8.1 Default receipt

The printout should have a consistent visual identity.

Example:

```text
================================
        MESSAGE FROM THE WEB
================================

FROM: Alex

Hope this actually prints on
your desk.

--------------------------------
Message #0042
August 4, 2026  •  11:42 AM

     SENT FROM THE INTERNET
```

Anonymous example:

```text
FROM: ANONYMOUS
```

### 8.2 Formatting rules

- Use printer-native ESC/POS text where practical.
- Use large or bold text for the header.
- Use left alignment for the main message.
- Use smaller text for metadata.
- Wrap text according to the printer’s actual character width.
- Normalize line endings.
- Prevent sender-controlled ESC/POS commands.
- Feed enough paper after the footer for readability.
- Cut automatically after each message.
- Avoid emoji as regular text unless converted to a supported bitmap.
- Avoid unnecessary QR codes in V1.

### 8.3 Message numbering

Every accepted message should receive a unique internal ID.

The printed receipt may include a human-readable sequence number such as:

`Message #0042`

Sequence numbers are optional but recommended because they reinforce the physical-project identity and help troubleshooting.

### 8.4 Timestamp

Print the local Seattle date and time.

Store all system timestamps in UTC and render them in the configured display timezone.

---

## 9. System Architecture

### 9.1 High-level architecture

```text
Public browser
      |
      v
Public web application
      |
      v
Cloud API and database queue
      ^
      |
Outbound polling or long-lived connection
      |
Windows print worker
      |
      v
Home LAN
      |
      v
Rongta RP820 thermal printer
```

### 9.2 Security boundary

The browser must never communicate directly with:

- The printer
- The home server
- The printer’s local IP address
- Any inbound port on the home network

The Windows worker initiates all communication with the cloud.

### 9.3 Suggested technology options

The implementation is not locked to a specific stack, but a practical stack could be:

#### Web application

- Next.js
- TypeScript
- Responsive web UI
- Hosted on Vercel or similar

#### Database and API

One of:

- Supabase Postgres
- Neon Postgres plus an API layer
- Firebase
- A small hosted Node.js API with PostgreSQL

Supabase is a strong option because it provides:

- PostgreSQL
- Row-level security
- Realtime subscriptions
- Authentication for the admin area
- Edge/server functions
- Easy deployment for a small project

#### Windows print worker

One of:

- Node.js with TypeScript
- Python
- .NET/C#

Node.js with TypeScript is a strong default if the website is also TypeScript.

#### Printer communication

- Raw TCP socket to printer
- ESC/POS command generation
- Default port likely 9100, subject to hardware confirmation

### 9.4 Worker communication model

Recommended initial approach:

- Worker sends heartbeat every 15 seconds.
- Worker polls or subscribes for pending jobs.
- Worker atomically claims one job.
- Worker formats and sends it to the printer.
- Worker records success or failure.
- Worker processes jobs one at a time.

Polling every 1 to 3 seconds is acceptable for this personal project and may be simpler than persistent realtime infrastructure.

---

## 10. Message and Job Lifecycle

### 10.1 Status model

Recommended statuses:

- `submitted`
- `approved`
- `queued`
- `claimed`
- `printing`
- `sent_to_printer`
- `failed`
- `expired`
- `rejected`
- `deleted`

For V1, approval may happen automatically, but the distinct state should remain in the data model to support later moderation.

### 10.2 Normal lifecycle

```text
submitted
  -> approved
  -> queued
  -> claimed
  -> printing
  -> sent_to_printer
```

### 10.3 Failure lifecycle

```text
claimed
  -> printing
  -> failed
```

The worker may retry only safe, clearly unsent failures.

Avoid automatic retries after an ambiguous socket failure because the printer may have received the job even if the worker did not receive a clean completion signal. Blind retries could print duplicates.

### 10.4 Duplicate prevention

Every browser submission should include an idempotency key.

The server must ensure that:

- Browser double-clicks do not create two jobs.
- Network retries do not create two jobs.
- Only one worker can claim a job.
- Completed jobs cannot be claimed again.

---

## 11. Data Model

### 11.1 Messages table

Suggested fields:

```text
id
public_id
sequence_number
sender_name
message_text
source
status
moderation_status
submitted_at
approved_at
claimed_at
sent_to_printer_at
failed_at
expired_at
expires_at
client_idempotency_key
sender_fingerprint
ip_hash
user_agent_summary
failure_code
failure_message
worker_id
retry_count
created_at
updated_at
```

### 11.2 Printer status table

Suggested fields:

```text
printer_id
worker_id
worker_online
printer_reachable
accepting_messages
manual_pause
queue_length
last_heartbeat_at
last_successful_print_at
last_error_code
last_error_summary
worker_version
updated_at
```

### 11.3 Blocklist table

Suggested fields:

```text
id
block_type
hashed_value
reason
created_at
expires_at
active
```

Potential block types:

- IP hash
- Browser fingerprint
- Future phone-number hash
- Exact phrase
- Repeated content pattern

### 11.4 Admin activity table

Suggested fields:

```text
id
admin_user_id
action
target_id
metadata
created_at
```

---

## 12. Public API Requirements

### 12.1 Get public printer status

`GET /api/printer/status`

Returns only coarse public information.

Example:

```json
{
  "status": "online",
  "label": "Printer online",
  "message": "Ready to print now.",
  "acceptingMessages": true
}
```

### 12.2 Submit message

`POST /api/messages`

Example request:

```json
{
  "name": "Alex",
  "message": "Hope this works.",
  "idempotencyKey": "client-generated-uuid"
}
```

Possible response:

```json
{
  "messageId": "msg_public_abc123",
  "status": "queued",
  "statusUrl": "/api/messages/msg_public_abc123/status"
}
```

The submission endpoint must:

- Recheck printer availability
- Validate fields
- Normalize text
- Apply rate limits
- Apply message safety checks
- Create an expiring queue job
- Return a public-safe identifier

### 12.3 Get message status

`GET /api/messages/{publicId}/status`

Public response should contain only:

- Current human-readable state
- Whether sending succeeded
- A short error if applicable

It must not return:

- IP address
- Full internal message record
- Worker ID
- Printer address
- Moderation details
- Internal error traces

---

## 13. Windows Print Worker Requirements

### 13.1 Installation and startup

The worker should be installable on the existing Windows server.

It should support one of:

- Windows service
- Scheduled task configured to start at boot
- Process manager that restarts it automatically

Preferred behavior:

- Start automatically after reboot
- Restart after crashes
- Log locally and to the cloud
- Run without requiring an open terminal
- Use environment variables for secrets and printer configuration

### 13.2 Configuration

Example configuration:

```text
CLOUD_API_URL
WORKER_API_KEY
PRINTER_IP
PRINTER_PORT
PRINTER_MODEL
PRINTER_TIMEOUT_MS
HEARTBEAT_INTERVAL_SECONDS
POLL_INTERVAL_SECONDS
DISPLAY_TIMEZONE
```

### 13.3 Worker operations

The worker must:

1. Confirm basic network reachability to the printer.
2. Send a heartbeat.
3. Request or subscribe to available jobs.
4. Atomically claim one job.
5. Sanitize and format print data.
6. Open a TCP connection to the printer.
7. Send ESC/POS bytes.
8. Close the connection.
9. Mark the job as sent or failed.
10. Continue processing one job at a time.

### 13.4 Test-print mode

The worker or admin page should support a test print that does not require a public submission.

Suggested test receipt:

```text
INTERNET PRINTER TEST

Worker: online
Network: connected
Printer: reachable
Time: [local timestamp]

If you can read this, the system works.
```

### 13.5 Logs

Local and cloud logs should capture:

- Worker startup
- Worker shutdown
- Heartbeat failures
- Printer connectivity changes
- Job claim
- Print attempt
- Print success
- Print failure
- Retry decisions
- Configuration errors

Message content should not be unnecessarily duplicated in logs.

---

## 14. Safety, Abuse, and Rate Limiting

The site is public even if discovery is expected to be limited. Basic controls should exist from the beginning.

### 14.1 Initial limits

Recommended starting values:

- Message length: 300 characters
- Name length: 30 characters
- Maximum line breaks: 8
- Per-IP limit: 3 messages per 10 minutes
- Per-IP daily limit: 20 messages
- Global daily limit: 100 messages
- Concurrent jobs per sender: 1
- Duplicate-content cooldown: 10 minutes
- Job expiration: 15 minutes

These values should be configurable without code changes.

### 14.2 CAPTCHA strategy

Do not require CAPTCHA for every normal visitor initially.

Use progressive friction:

- No CAPTCHA for normal usage
- CAPTCHA after suspicious frequency
- CAPTCHA after repeated failed submissions
- Hard block for obvious automation or abuse

### 14.3 Content filtering

At minimum, the system should be able to:

- Reject control characters
- Reject attempts to inject printer commands
- Reject excessive repeated characters
- Reject extremely repetitive content
- Reject or hold obvious threats, hate, sexual content, or personal-data abuse
- Block known abusive phrases or senders

Moderation can initially be simple and rule-based. The architecture should support a later `held_for_review` state.

### 14.4 Privacy

The public page should state:

- Messages are not publicly displayed.
- Messages physically print near Justin and may be seen by people nearby.
- Basic technical information may be retained for abuse prevention.
- Do not submit sensitive personal information.

Do not store raw IP addresses longer than necessary. Prefer a salted hash for rate limiting and blocking.

### 14.5 Emergency controls

Justin must be able to:

- Pause all new submissions immediately
- Set the site to offline
- Delete pending jobs
- Block a sender
- Reduce the global daily limit
- Disable the worker API key
- Stop the Windows worker
- Power off the printer

---

## 15. Admin Experience

### 15.1 Authentication

The admin area must require authentication.

No public registration is needed.

### 15.2 Admin dashboard

Minimum information:

- Public status
- Worker status
- Printer reachability
- Pause/resume control
- Queue length
- Last heartbeat
- Last successful print
- Recent message jobs
- Recent failures
- Current daily usage
- Global daily limit

### 15.3 Admin actions

Minimum actions:

- Pause submissions
- Resume submissions
- Send test print
- Retry eligible failed job
- Delete queued job
- Mark job resolved
- Block sender
- Unblock sender
- Change rate limits
- Change global daily limit
- View failure details

### 15.4 Queue behavior when paused

V1 should not accept new public submissions while paused.

Existing queued jobs should not automatically print until Justin explicitly resumes.

On resume, the admin should be able to choose:

- Resume and process valid queued jobs
- Resume and discard queued jobs

---

## 16. Reliability and Error Handling

### 16.1 Expected failure cases

The system should handle:

- Printer powered off
- Printer Ethernet disconnected
- Home server offline
- Worker crashed
- Internet connection lost
- Cloud API unavailable
- Printer IP changed
- Printer out of paper
- Printer cover open
- Cutter failure
- Message accepted just before status changes
- Duplicate browser submission
- Worker restart during a job
- Ambiguous socket completion

### 16.2 Retry policy

Safe retry examples:

- Cloud request failed before job claim
- Worker could not connect to printer at all
- Job claim expired before printing began

Unsafe or ambiguous retry examples:

- Socket disconnected after bytes were sent
- Worker crashed during transmission
- Printer accepted data but did not return status

Ambiguous jobs should be marked for manual review rather than automatically reprinted.

### 16.3 Printer status limitations

The RP820 may support ESC/POS real-time status commands, but capabilities must be tested.

Until verified, “printer reachable” should mean:

- Worker can open the configured network connection, and
- Recent print operations have not failed

Do not assume this proves:

- Paper is present
- Cover is closed
- Cutter worked
- Receipt physically emerged

---

## 17. User Interface Direction

### 17.1 Tone

The site should be:

- Literal
- Personal
- Minimal
- Slightly playful
- Easy to understand in a few seconds

Avoid:

- Overly technical networking language
- Fake terminal aesthetics unless it genuinely improves the concept
- Excessive explanation before the form
- Account creation
- Complex navigation
- A public social feed

### 17.2 Visual ideas

Potential visual elements:

- Receipt-shaped message form
- Small status light with text label
- Simple line illustration of the printer
- Live character counter
- Subtle printing animation after submission
- Optional receipt preview
- Lifetime printed-message count

Do not rely on color alone for status.

### 17.3 Mobile behavior

The site should work well on phones because most visitors will likely open the link from messaging or social media.

Requirements:

- Large text area
- Full-width primary button
- Keyboard-safe layout
- Clear status at the top
- No horizontal scrolling
- Confirmation visible without requiring precise interaction

---

## 18. Analytics and Observability

Track operational events, not invasive user profiles.

Suggested events:

- Page viewed
- Printer status viewed
- Message submission started
- Message rejected by validation
- Message accepted
- Message claimed by worker
- Message sent to printer
- Message failed
- Rate limit triggered
- Printer went offline
- Printer returned online
- Admin paused
- Admin resumed

Useful metrics:

- Messages submitted per day
- Messages successfully sent
- Failure rate
- Median time from submission to printer send
- Printer online percentage
- Rate-limit events
- Average message length
- Queue wait time

Do not expose message content in third-party analytics.

---

## 19. Acceptance Criteria

V1 is complete when all of the following are true:

1. A public visitor can open the website without an account.
2. The site displays online, offline, or paused printer status.
3. The status is based on the Windows worker and printer reachability, not only website availability.
4. The form is disabled while the printer is offline or paused.
5. A visitor can submit an optional name and a message of up to 300 characters.
6. The system validates and safely stores the submission.
7. The Windows worker claims the job exactly once.
8. The worker sends a formatted ESC/POS receipt to the RP820 over Ethernet.
9. The printer cuts the receipt.
10. The website displays submission progress and a final result.
11. Duplicate browser requests do not produce duplicate prints.
12. Jobs expire and do not unexpectedly print much later.
13. Justin can pause and resume submissions.
14. Justin can view recent jobs and failures.
15. Justin can send a test print.
16. Basic per-sender and global rate limits work.
17. The home network is not exposed through router port forwarding.
18. The worker starts automatically after the Windows server restarts.
19. Secrets are not stored in the public codebase.
20. Internal network and error details are not exposed publicly.

---

## 20. Suggested Build Phases

### Phase 0: Hardware validation

- Connect RP820 to Ethernet switch.
- Find its local IP address.
- Reserve the IP in the router.
- Confirm raw network printing.
- Confirm ESC/POS formatting.
- Confirm automatic cutting.
- Test paper feed and line width.
- Determine whether real-time paper and cover status commands work.

Deliverable:

A local script on the Windows server prints a formatted test message reliably.

### Phase 1: Cloud queue and worker

- Create database schema.
- Create worker authentication.
- Implement heartbeat.
- Implement public printer status calculation.
- Implement job claim.
- Implement print formatting.
- Implement success and failure updates.
- Install worker for automatic Windows startup.

Deliverable:

A manually created cloud job prints on the physical printer.

### Phase 2: Public website

- Build landing page.
- Show printer status.
- Add name and message form.
- Add validation and character counter.
- Add submission API.
- Add progress states.
- Add rate limiting.
- Disable form while offline or paused.

Deliverable:

A public visitor can submit a message and see it print.

### Phase 3: Admin controls

- Add admin authentication.
- Add dashboard.
- Add pause/resume.
- Add print history.
- Add failed-job details.
- Add test print.
- Add blocklist.
- Add configurable limits.

Deliverable:

Justin can operate and recover the system without editing the database manually.

### Phase 4: Hardening

- Improve moderation.
- Add adaptive CAPTCHA.
- Test worker restarts.
- Test network failures.
- Test duplicate requests.
- Test queue expiration.
- Improve logging and alerts.
- Review privacy copy.
- Add basic analytics.

Deliverable:

The site can remain publicly accessible with reasonable safeguards.

---

## 21. Deferred Backlog

Potential later additions:

### Input channels

- Twilio SMS
- MMS rejection or image handling
- Email
- iPhone Shortcut
- Home-screen web app
- Slack or Discord
- Authenticated API

### Interaction features

- Private trusted-sender links
- Sender reply or reaction
- QR code for Justin to respond
- “Justin saw your message” acknowledgment
- Scheduled printing
- Optional queued delivery while offline
- Message categories
- Receipt themes
- Sender-selected icon
- Public activity counter
- Public printer status history

### Content types

- Link with QR code
- Reminder
- Doodle
- Monochrome image
- Handwritten message
- Structured cards
- Multi-part conversations

### Hardware additions

- Physical reaction buttons
- Receipt collection tray
- Smart plug integration
- Home Assistant control
- Printer camera for private diagnostics
- Second printer

---

## 22. Open Questions for Implementation

These questions should be resolved during setup or early development:

1. What local IP and TCP port does the RP820 use?
2. Does it support reliable paper-out, cover-open, and cutter status over Ethernet?
3. What line width produces the best receipt formatting?
4. Does the printer perform full or partial cuts by default?
5. Does the Windows worker use Node.js, Python, or .NET?
6. Which cloud stack should host the API and queue?
7. Should the public site show a lifetime message count?
8. Should a basic receipt preview be included in V1?
9. What exact moderation rules should initially block versus hold a message?
10. What domain or project name should be used?
11. Should accepted jobs expire after 15 minutes or another interval?
12. Should the site use “sent to printer” or “printed” as its final confirmation language?
13. Should anonymous be the default sender state?
14. What visual branding, if any, should appear on each receipt?

---

## 23. Recommended Initial Decisions

To reduce ambiguity, the implementation should begin with these defaults:

- Public website only
- No user accounts
- Optional sender name
- 300-character message limit
- Plain text only
- Printer must be online to submit
- No offline public queue
- Accepted jobs expire after 15 minutes
- One message equals one receipt
- Automatic cutter enabled
- Worker polls every 1 to 3 seconds
- Worker heartbeat every 15 seconds
- Worker considered offline after 45 seconds
- Printer connected through raw TCP ESC/POS
- Messages processed sequentially
- Basic rule-based moderation
- Adaptive CAPTCHA rather than CAPTCHA on every submission
- Public message contents never shown
- Private admin dashboard
- No router port forwarding
- Final sender confirmation: **Your message was sent to the printer successfully.**

---

## 24. Definition of the First Successful Demo

The first successful end-to-end demo is:

1. The RP820 is connected to the desk Ethernet switch.
2. The Windows server reports that it and the printer are online.
3. The public website displays **Printer online**.
4. A visitor enters:
   - Name: `Alex`
   - Message: `Hello from the internet.`
5. The visitor presses **Print this message**.
6. The site displays:
   - Sending
   - Waiting for printer
   - Printing
   - Sent successfully
7. Within several seconds, the RP820 prints and cuts a receipt containing the name, message, message number, and Seattle timestamp.
8. The admin dashboard records the successful job.
9. Repeating the same browser request does not produce an unintended duplicate.

That demo proves the complete product concept.
