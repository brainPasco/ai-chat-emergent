import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const client = axios.create({
  baseURL: API,
  withCredentials: true,
});

export const api = {
  me: () => client.get("/auth/me").then((r) => r.data),
  createSession: (sessionIdFromOAuth) =>
    client.post("/auth/session", { session_id: sessionIdFromOAuth }).then((r) => r.data),
  logout: () => client.post("/auth/logout").then((r) => r.data),

  listSessions: () => client.get("/sessions").then((r) => r.data),
  createChatSession: (title = "New Workspace") =>
    client.post("/sessions", { title }).then((r) => r.data),
  deleteChatSession: (id) => client.delete(`/sessions/${id}`).then((r) => r.data),
  renameSession: (id, title) =>
    client.patch(`/sessions/${id}`, { title }).then((r) => r.data),
  getMessages: (id) => client.get(`/sessions/${id}/messages`).then((r) => r.data),

  // Providers
  listProviders: () => client.get("/providers").then((r) => r.data),
  createProvider: (body) => client.post("/providers", body).then((r) => r.data),
  updateProvider: (id, body) => client.patch(`/providers/${id}`, body).then((r) => r.data),
  deleteProvider: (id) => client.delete(`/providers/${id}`).then((r) => r.data),
  testProvider: (id) => client.post(`/providers/${id}/test`).then((r) => r.data),

  // Admin
  adminMe: () => client.get("/admin/me").then((r) => r.data),
  adminStats: () => client.get("/admin/stats").then((r) => r.data),
  adminUsers: () => client.get("/admin/users").then((r) => r.data),
  adminDeleteUser: (id) => client.delete(`/admin/users/${id}`).then((r) => r.data),
};

/**
 * Stream chat via fetch + ReadableStream parsing SSE-like `data:` lines.
 * onEvent receives parsed JSON for each event.
 * Returns an AbortController so the caller can abort.
 */
export function streamChat({ sessionId, prompt, mode, enableGrounding, history }, onEvent) {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${API}/chat/stream`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          prompt,
          mode,
          enable_grounding: !!enableGrounding,
          history: history || [],
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        onEvent({ type: "error", message: `HTTP ${res.status}` });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const json = t.slice(5).trim();
          if (!json) continue;
          try {
            onEvent(JSON.parse(json));
          } catch (e) {
            // ignore parse errors
          }
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        onEvent({ type: "error", message: e.message || "Stream failed" });
      }
    }
  })();

  return controller;
}
