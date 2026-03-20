// src/api.js

export function getToken() {
  return (
    localStorage.getItem("token") ||
    sessionStorage.getItem("token") ||
    null
  );
}

export async function apiFetch(path, opts = {}) {
  const token = getToken();

  const headers = {
    "Content-Type": "application/json",
    ...(opts.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    ...opts,
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "API error");
  }

  return res.json();
}
