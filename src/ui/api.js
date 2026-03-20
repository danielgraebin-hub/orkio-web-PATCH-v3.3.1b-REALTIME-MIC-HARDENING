function normalizeTranscriptText(text) {
  return (text || "").trim();
}

// Orkio Web - API client helpers (Railway-safe)
// Keeps base URL clean and adds org + auth headers consistently.

import { getTenant, getToken } from "../lib/auth.js";
const ORKIO_ENV = (typeof window !== "undefined" && window.__ORKIO_ENV__) ? window.__ORKIO_ENV__ : {};
const DEFAULT_SUMMIT_LANGUAGE_PROFILE = (ORKIO_ENV.VITE_SUMMIT_LANGUAGE_PROFILE || import.meta.env.VITE_SUMMIT_LANGUAGE_PROFILE || "pt-BR").trim() || "pt-BR";

export function apiBase() {
  const raw = (window.__ORKIO_ENV__?.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || "").trim();
  const base = raw.replace(/\/$/, "");
  return base.endsWith("/api") ? base.slice(0, -4) : base;
}

export function joinApi(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${apiBase()}${p}`;
}

export function headers({ token, org, json = true } = {}) {
  const h = {};
  const t = (token ?? getToken() ?? "").trim();
  const o = (org ?? getTenant() ?? "").trim();
  if (json) h["Content-Type"] = "application/json";
  if (t) h["Authorization"] = `Bearer ${t}`;
  if (o) h["X-Org-Slug"] = o;
  return h;
}

// Generic JSON fetch helper
export async function apiFetch(path, { method = "GET", body, token, org, json = true, signal, headers: headersOverride } = {}) {
  const url = joinApi(path);
  const res = await fetch(url, {
    method,
    headers: { ...headers({ token, org, json }), ...(headersOverride || {}) },
    body: body == null ? undefined : (json ? JSON.stringify(body) : body),
    signal,
    credentials: "include",
  });

  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");
  const payload = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => "");
  if (!res.ok) {
    const msg = (isJson ? (payload?.detail || payload?.message) : payload) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return { data: payload, status: res.status };
}

// Upload file to /api/files (multipart)
export async function uploadFile(file, { token, org, agentId, agentIds, threadId, intent, institutionalRequest, linkAllAgents } = {}) {
  const fd = new FormData();
  fd.append("file", file);
  if (agentId) fd.append("agent_id", agentId);
  if (Array.isArray(agentIds) && agentIds.length) fd.append("agent_ids", agentIds.join(","));
  if (threadId) fd.append("thread_id", threadId);
  if (intent) fd.append("intent", intent);
  if (institutionalRequest) fd.append("institutional_request", "true");
  if (linkAllAgents) fd.append("link_all_agents", "true");
  fd.append("link_agent", "true");
  const res = await fetch(joinApi("/api/files/upload"), {
    method: "POST",
    headers: headers({ token, org, json: false }),
    body: fd,
    credentials: "include",
  });
  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");
  const payload = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => "");
  if (!res.ok) {
    const msg = (isJson ? (payload?.detail || payload?.message) : payload) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return { data: payload, status: res.status };
}

// Chat helper: POST /api/chat
export async function chat({ thread_id = null, agent_id = null, message, top_k = 6, token, org, trace_id = null, client_message_id = null,
  signal,
} = {}) {
  const tenant = (org ?? getTenant() ?? "public").trim() || "public";
  return apiFetch("/api/chat", {
    method: "POST",
    token,
    org: tenant,
    signal,

    body: { tenant, thread_id, agent_id, message, top_k, trace_id, client_message_id },
  });
}

// Public chat (landing) — no auth required
export async function publicChat({ lead_id, message, thread_id }) {
  return apiFetch("/api/public/chat", {
    method: "POST",
    body: { lead_id, message, thread_id }
  });
}

// SSE streaming chat — V2V-PATCH: aceita trace_id para correlação de logs
export async function chatStream({ thread_id = null, agent_id = null, message, top_k = 6, token, org, trace_id = null, client_message_id = null,
  signal,
} = {}) {
  const tenant = (org ?? getTenant() ?? "public").trim() || "public";
  const url = apiBase() + "/api/chat/stream";
  const hdrs = {
    "Content-Type": "application/json",
    "X-Org-Slug": tenant,
  };
  if (token) hdrs["Authorization"] = `Bearer ${token}`;
  if (trace_id) hdrs["X-Trace-Id"] = trace_id;
  const body = JSON.stringify({ tenant, thread_id, agent_id, message, top_k, trace_id, client_message_id });
  const res = await fetch(url, { method: "POST", headers: hdrs, body,
    signal, credentials: "include" });
  return res;
}

// V2V-PATCH: STT — envia blob de áudio para /api/stt, retorna {text, trace_id}
// Usa MediaRecorder (webm/opus) — fallback para SpeechRecognition no caller
export async function transcribeAudio(audioBlob, { token, org, trace_id = null, language = null } = {}) {
  const tenant = (org ?? getTenant() ?? "public").trim() || "public";
  const fd = new FormData();
  // Nomear o arquivo com extensão correta para o backend detectar o formato
  const ext = (audioBlob.type || "audio/webm").includes("mp4") ? "mp4" : "webm";
  fd.append("file", audioBlob, `recording.${ext}`);
  if (language) fd.append("language", language);

  const hdrs = {
    "X-Org-Slug": tenant,
  };
  const t = (token ?? getToken() ?? "").trim();
  if (t) hdrs["Authorization"] = `Bearer ${t}`;
  if (trace_id) hdrs["X-Trace-Id"] = trace_id;

  const res = await fetch(joinApi("/api/stt"), {
    method: "POST",
    headers: hdrs,
    body: fd,
    credentials: "include",
  });

  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");
  const payload = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => "");

  if (!res.ok) {
    const msg = (isJson ? (payload?.detail || payload?.message) : payload) || `STT HTTP ${res.status}`;
    throw new Error(msg);
  }
  if (payload && typeof payload.text === "string") {
    payload.text = normalizeTranscriptText(payload.text);
  }
  return payload; // {text, language, trace_id}
}


export async function requestFounderHandoff({ token, org, thread_id = null, interest_type = "general", message, source = "app_console", consent_contact = false } = {}) {
  return apiFetch("/api/founder/handoff", {
    method: "POST",
    token,
    org,
    body: { thread_id, interest_type, message, source, consent_contact },
  });
}


// Realtime/WebRTC: mint ephemeral client secret for browser connection
export async function getRealtimeClientSecret({ agent_id = null, voice = "nova", model = "gpt-realtime-mini", ttl_seconds = 600 } = {}) {
  const token = getToken();
  const org = getTenant();
  const res = await fetch(apiBase() + "/api/realtime/client_secret", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(org ? { "X-Org-Slug": org } : {}),
    },
    body: JSON.stringify({ agent_id, voice, model, ttl_seconds }),
 
    credentials: "include",
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Realtime token failed (${res.status}): ${t || res.statusText}`);
  }
  return await res.json();
}


// =========================
// PATCH0100_27A — Realtime persistence helpers
// =========================

export async function startRealtimeSession({ agent_id = null, thread_id = null, voice = "cedar", model = "gpt-realtime-mini", ttl_seconds = 600 } = {}) {
  const token = getToken();
  const org = getTenant();
  const res = await fetch(apiBase() + "/api/realtime/start", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(org ? { "X-Org-Slug": org } : {}),
    },
    body: JSON.stringify({ agent_id, thread_id, voice, model, ttl_seconds }),
 
    credentials: "include",
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Realtime start failed (${res.status}): ${t || res.statusText}`);
  }
  return await res.json();
}

export async function postRealtimeEventsBatch({ session_id, events } = {}) {
  const token = getToken();
  const org = getTenant();
  const res = await fetch(apiBase() + "/api/realtime/events:batch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(org ? { "X-Org-Slug": org } : {}),
    },
    body: JSON.stringify({ session_id, events }),
 
    credentials: "include",
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Realtime events batch failed (${res.status}): ${t || res.statusText}`);
  }
  return await res.json().catch(() => ({}));
}

export async function endRealtimeSession({ session_id, ended_at = null, meta = null } = {}) {
  const token = getToken();
  const org = getTenant();
  const res = await fetch(apiBase() + "/api/realtime/end", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(org ? { "X-Org-Slug": org } : {}),
    },
    body: JSON.stringify({ session_id, ended_at, meta }),
 
    credentials: "include",
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Realtime end failed (${res.status}): ${t || res.statusText}`);
  }
  return await res.json().catch(() => ({}));
}

// PATCH0100_27_2B — Fetch persisted realtime session/events (for transcript_punct polling)
export async function getRealtimeSession({ session_id, finals_only = true } = {}) {
  const token = getToken();
  const org = getTenant();
  const qs = finals_only ? '?finals_only=true' : '';
  const res = await fetch(apiBase() + `/api/realtime/sessions/${encodeURIComponent(session_id)}${qs}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(org ? { 'X-Org-Slug': org } : {}),
    },
 
    credentials: "include",
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Realtime get session failed (${res.status}): ${t || res.statusText}`);
  }
  return await res.json();
}

export async function downloadRealtimeAta({ session_id } = {}) {
  const token = getToken();
  const org = getTenant();
  const res = await fetch(apiBase() + `/api/realtime/sessions/${encodeURIComponent(session_id)}/ata.txt`, {
    method: 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(org ? { 'X-Org-Slug': org } : {}),
    },
 
    credentials: "include",
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Realtime ATA failed (${res.status}): ${t || res.statusText}`);
  }
  return await res.blob();
}

export async function startSummitSession({ agent_id = null, thread_id = null, voice = "cedar", model = "gpt-realtime-mini", ttl_seconds = 600, mode = "summit", response_profile = "stage", language_profile = DEFAULT_SUMMIT_LANGUAGE_PROFILE } = {}) {
  const token = getToken();
  const org = getTenant();
  const res = await fetch(apiBase() + "/api/realtime/start", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(org ? { "X-Org-Slug": org } : {}),
    },
    body: JSON.stringify({ agent_id, thread_id, voice, model, ttl_seconds, mode, response_profile, language_profile }),
    credentials: "include",
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Summit realtime start failed (${res.status}): ${t || res.statusText}`);
  }
  return await res.json();
}

export async function getSummitConfig() {
  return apiFetch("/api/summit/config", { method: "GET" });
}

export async function getSummitSessionScore({ session_id } = {}) {
  return apiFetch(`/api/realtime/sessions/${encodeURIComponent(session_id)}/score`, { method: "GET" });
}

export async function submitSummitSessionReview({ session_id, clarity = null, naturalness = null, institutional_fit = null, notes = "" } = {}) {
  return apiFetch(`/api/realtime/sessions/${encodeURIComponent(session_id)}/review`, {
    method: "POST",
    body: { clarity, naturalness, institutional_fit, notes },
  });
}



export async function validateInvestorAccessCode({ code, org } = {}) {
  return apiFetch("/api/investor/access/validate", {
    method: "POST",
    org,
    body: { label: code, plain_code: code },
  });
}

export async function forgotPassword({ email, tenant, turnstile_token = null } = {}) {
  return apiFetch("/api/auth/forgot-password", {
    method: "POST",
    org: tenant,
    body: { tenant, email, turnstile_token },
  });
}

export async function resetPassword({ token, password, password_confirm, tenant } = {}) {
  return apiFetch("/api/auth/reset-password", {
    method: "POST",
    org: tenant,
    body: { tenant, token, password, password_confirm },
  });
}

export async function getFounderEscalations({ token, org } = {}) {
  return apiFetch("/api/admin/investor/escalations", { method: "GET", token, org });
}

export async function getFounderEscalation({ escalation_id, token, org } = {}) {
  return apiFetch(`/api/admin/investor/escalations/${encodeURIComponent(escalation_id)}`, { method: "GET", token, org });
}

export async function setFounderEscalationAction({ escalation_id, action_type, token, org } = {}) {
  return apiFetch(`/api/admin/investor/escalations/${encodeURIComponent(escalation_id)}/action`, {
    method: "POST",
    token, org,
    body: { action_type },
  });
}


export async function guardRealtimeTranscript({ thread_id = null, message = "" } = {}) {
  return apiFetch("/api/realtime/guard", {
    method: "POST",
    body: { thread_id, message },
  });
}
