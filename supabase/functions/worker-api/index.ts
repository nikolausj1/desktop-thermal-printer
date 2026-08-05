import { createClient } from "npm:@supabase/supabase-js@2";

type JsonRecord = Record<string, unknown>;

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const expectedWorkerApiKey = Deno.env.get("WORKER_API_KEY");

if (!supabaseUrl || !serviceRoleKey || !expectedWorkerApiKey) {
  throw new Error("Worker API is missing required server configuration.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(status: number, body: JsonRecord): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function object(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

async function validApiKey(provided: string | null): Promise<boolean> {
  if (!provided) return false;
  const [actual, expected] = await Promise.all([
    sha256(provided),
    sha256(expectedWorkerApiKey),
  ]);
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual[index] ^ expected[index];
  }
  return difference === 0;
}

function databaseFailure(context: string, error: { message: string }): Response {
  console.error(JSON.stringify({ event: "database_error", context, message: error.message }));
  return json(500, { ok: false, error: "Worker operation failed." });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed." });
  }

  if (!(await validApiKey(request.headers.get("x-worker-api-key")))) {
    return json(401, { ok: false, error: "Unauthorized." });
  }

  let body: JsonRecord | null = null;
  try {
    body = object(await request.json());
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body." });
  }

  const action = string(body?.action);
  const payload = object(body?.payload);
  if (!action || !payload) {
    return json(400, { ok: false, error: "Action and payload are required." });
  }

  if (action === "heartbeat") {
    const health = object(payload.health);
    const workerId = string(payload.workerId);
    const workerVersion = string(payload.workerVersion);
    const printerId = string(payload.printerId);
    if (!health || !workerId || !workerVersion || !printerId) {
      return json(400, { ok: false, error: "Invalid heartbeat payload." });
    }

    const { error } = await supabase.rpc("record_worker_heartbeat", {
      p_worker_id: workerId,
      p_worker_version: workerVersion,
      p_printer_id: printerId,
      p_accepting_messages: payload.acceptingMessages === true,
      p_printer_reachable: health.reachable === true,
      p_cover_open: typeof health.coverOpen === "boolean" ? health.coverOpen : null,
      p_cutter_error: typeof health.cutterError === "boolean" ? health.cutterError : null,
      p_paper_end: typeof health.paperEnd === "boolean" ? health.paperEnd : null,
      p_paper_near_end:
        typeof health.paperNearEnd === "boolean" ? health.paperNearEnd : null,
      p_printer_offline:
        typeof health.printerOffline === "boolean" ? health.printerOffline : null,
      p_error_code: typeof health.diagnosticCode === "string" ? health.diagnosticCode : null,
    });
    if (error) return databaseFailure(action, error);
    return json(200, { ok: true, data: null });
  }

  if (action === "claim") {
    const workerId = string(payload.workerId);
    const printerId = string(payload.printerId);
    if (!workerId || !printerId) {
      return json(400, { ok: false, error: "Invalid claim payload." });
    }

    const { data, error } = await supabase.rpc("claim_next_print_job", {
      p_worker_id: workerId,
      p_printer_id: printerId,
    });
    if (error) return databaseFailure(action, error);
    const row = Array.isArray(data) ? data[0] : null;
    return json(200, {
      ok: true,
      data: row
        ? {
            id: row.id,
            publicId: row.public_id,
            sequenceNumber: Number(row.sequence_number),
            senderName: row.sender_name,
            messageText: row.message_text,
            submittedAt: row.submitted_at,
            expiresAt: row.expires_at,
            deviceLabel: row.device_label,
            locationLabel: row.location_label,
          }
        : null,
    });
  }

  if (action === "mark_printing") {
    const workerId = string(payload.workerId);
    const jobId = string(payload.jobId);
    if (!workerId || !jobId) {
      return json(400, { ok: false, error: "Invalid printing payload." });
    }
    const { data, error } = await supabase.rpc("mark_print_job_printing", {
      p_worker_id: workerId,
      p_job_id: jobId,
    });
    if (error) return databaseFailure(action, error);
    if (data !== true) return json(409, { ok: false, error: "Job cannot begin printing." });
    return json(200, { ok: true, data: null });
  }

  if (action === "complete") {
    const workerId = string(payload.workerId);
    const jobId = string(payload.jobId);
    const status = string(payload.status);
    if (
      !workerId ||
      !jobId ||
      !status ||
      !["sent_to_printer", "failed", "delivery_unknown"].includes(status)
    ) {
      return json(400, { ok: false, error: "Invalid completion payload." });
    }
    const { data, error } = await supabase.rpc("complete_print_job", {
      p_worker_id: workerId,
      p_job_id: jobId,
      p_status: status,
      p_failure_code: typeof payload.failureCode === "string" ? payload.failureCode : null,
      p_failure_message:
        typeof payload.failureMessage === "string" ? payload.failureMessage.slice(0, 250) : null,
    });
    if (error) return databaseFailure(action, error);
    if (data !== true) return json(409, { ok: false, error: "Job cannot be completed." });
    return json(200, { ok: true, data: null });
  }

  return json(400, { ok: false, error: "Unsupported action." });
});
