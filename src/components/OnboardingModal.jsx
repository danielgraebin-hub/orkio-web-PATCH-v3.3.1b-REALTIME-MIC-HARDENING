import React, { useMemo, useState } from "react";
import { apiFetch } from "../ui/api.js";
import { getTenant, getToken } from "../lib/auth.js";

const USER_TYPES = [
  { value: "investor", label: "Investor" },
  { value: "founder", label: "Founder" },
  { value: "enterprise", label: "Enterprise" },
  { value: "developer", label: "Developer" },
  { value: "other", label: "Other" },
];

const INTENTS = [
  { value: "exploring", label: "Exploring the platform" },
  { value: "company_eval", label: "Evaluating for my company" },
  { value: "investment", label: "Investment opportunity" },
  { value: "partnership", label: "Partnership" },
  { value: "curious", label: "Just curious" },
];

const fieldStyle = {
  width: "100%",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.05)",
  color: "#fff",
  padding: "14px 16px",
  fontSize: 16,
  outline: "none",
  boxSizing: "border-box",
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
};

const optionStyle = {
  backgroundColor: "#0f172a",
  color: "#ffffff",
};

async function saveOnboarding(payload, token, org) {
  const attempts = [
    { path: "/api/user/onboarding", method: "POST" },
    { path: "/api/user/onboarding", method: "PUT" },
    { path: "/api/onboarding", method: "POST" },
    { path: "/api/onboarding", method: "PUT" },
  ];

  let lastErr = null;

  for (const attempt of attempts) {
    try {
      const res = await apiFetch(attempt.path, {
        method: attempt.method,
        token,
        org,
        body: payload,
      });
      return res?.data || res;
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || "");
      const isMethodMismatch =
        msg.includes("405") ||
        msg.includes("Method Not Allowed") ||
        msg.includes("Not Found") ||
        msg.includes("404");
      if (!isMethodMismatch) {
        throw err;
      }
    }
  }

  throw lastErr || new Error("Could not save onboarding.");
}

export default function OnboardingModal({ user, onComplete }) {
  const [form, setForm] = useState({
    company: user?.company || "",
    role: user?.profile_role || "",
    user_type: user?.user_type || "",
    intent: user?.intent || "",
    notes: user?.notes || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const fullName = useMemo(() => (user?.name || "").trim(), [user]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e?.preventDefault?.();
    if (!form.user_type || !form.intent) {
      setError("Please choose your user type and main interest.");
      return;
    }

    const payload = {
      company: form.company || null,
      role: form.role || null,
      user_type: form.user_type,
      intent: form.intent,
      notes: form.notes || null,
      onboarding_completed: true,
    };

    setBusy(true);
    setError("");

    try {
      const token = getToken();
      const org = getTenant();

      const result = await saveOnboarding(payload, token, org);
      const nextUser = result?.user
        ? { ...user, ...result.user }
        : {
            ...user,
            company: payload.company,
            profile_role: payload.role,
            user_type: payload.user_type,
            intent: payload.intent,
            notes: payload.notes,
            onboarding_completed: true,
          };

      onComplete?.(nextUser);
    } catch (err) {
      setError(err?.message || "Could not save onboarding.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(5,8,18,0.92)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 680,
          maxHeight: "90vh",
          overflowY: "auto",
          borderRadius: 24,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "linear-gradient(180deg, rgba(18,24,41,0.98), rgba(9,14,26,0.98))",
          boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
          color: "#fff",
          padding: 20,
          boxSizing: "border-box",
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: 12,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.55)",
            }}
          >
            Summit private mode
          </div>
          <h2 style={{ margin: "8px 0 6px", fontSize: 28, lineHeight: 1.1 }}>
            Welcome to Orkio
          </h2>
          <p style={{ margin: 0, color: "rgba(255,255,255,0.72)", lineHeight: 1.5 }}>
            A quick 30-second setup so Orkio can focus the experience around you.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
          <div>
            <label style={{ display: "block", marginBottom: 8, color: "rgba(255,255,255,0.7)" }}>
              Full name
            </label>
            <input value={fullName} readOnly style={{ ...fieldStyle, opacity: 0.85 }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            <div>
              <label style={{ display: "block", marginBottom: 8, color: "rgba(255,255,255,0.7)" }}>
                Company
              </label>
              <input
                value={form.company}
                onChange={(e) => setField("company", e.target.value)}
                placeholder="Your company"
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 8, color: "rgba(255,255,255,0.7)" }}>
                Role / Title
              </label>
              <input
                value={form.role}
                onChange={(e) => setField("role", e.target.value)}
                placeholder="CEO, Partner, Product Lead..."
                style={fieldStyle}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            <div>
              <label style={{ display: "block", marginBottom: 8, color: "rgba(255,255,255,0.7)" }}>
                User type
              </label>
              <select
                value={form.user_type}
                onChange={(e) => setField("user_type", e.target.value)}
                style={fieldStyle}
              >
                <option style={optionStyle} value="">
                  Choose one
                </option>
                {USER_TYPES.map((item) => (
                  <option key={item.value} value={item.value} style={optionStyle}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 8, color: "rgba(255,255,255,0.7)" }}>
                Main interest
              </label>
              <select
                value={form.intent}
                onChange={(e) => setField("intent", e.target.value)}
                style={fieldStyle}
              >
                <option style={optionStyle} value="">
                  Choose one
                </option>
                {INTENTS.map((item) => (
                  <option key={item.value} value={item.value} style={optionStyle}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 8, color: "rgba(255,255,255,0.7)" }}>
              Anything you'd like Orkio to focus on?
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              placeholder="Optional note"
              rows={4}
              style={{ ...fieldStyle, resize: "vertical", minHeight: 112 }}
            />
          </div>
        </div>

        {error ? <div style={{ marginTop: 14, color: "#ffb4b4" }}>{error}</div> : null}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            marginTop: 18,
            flexWrap: "wrap",
          }}
        >
          <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>
            This appears only once after your approved login.
          </div>
          <button
            type="submit"
            disabled={busy}
            style={{
              border: 0,
              borderRadius: 16,
              padding: "14px 20px",
              minWidth: 220,
              fontSize: 16,
              fontWeight: 600,
              cursor: busy ? "wait" : "pointer",
              background: "#ffffff",
              color: "#0b1020",
            }}
          >
            {busy ? "Saving..." : "Continue to Orkio"}
          </button>
        </div>
      </form>
    </div>
  );
}
