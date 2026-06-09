import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const hash = window.location.hash || "";
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const sessionId = params.get("session_id");

    if (!sessionId) {
      navigate("/login", { replace: true });
      return;
    }

    (async () => {
      try {
        const user = await api.createSession(sessionId);
        setUser(user);
        // Clear hash and go to workspace
        window.history.replaceState(null, "", window.location.pathname);
        navigate("/workspace", { replace: true, state: { user } });
      } catch (e) {
        console.error("Session exchange failed", e);
        navigate("/login", { replace: true });
      }
    })();
  }, [navigate, setUser]);

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#050505] text-white">
      <div data-testid="auth-callback-loading" className="font-mono-code text-sm text-white/60">
        Authenticating...
      </div>
    </div>
  );
}
