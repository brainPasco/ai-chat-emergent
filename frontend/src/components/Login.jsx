import React from "react";
import { motion } from "framer-motion";
import { Sparkles, Zap, Cpu, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Login() {
  const handleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/workspace";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div
      className="relative h-screen w-screen overflow-hidden bg-[#050505] text-white flex"
      data-testid="login-screen"
    >
      {/* Background image */}
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1640346876473-f76a73c71539?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njd8MHwxfHNlYXJjaHwzfHxhYnN0cmFjdCUyMGRhcmslMjBncmlkfGVufDB8fHx8MTc4MTA0NzIyM3ww&ixlib=rb-4.1.0&q=85')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className="absolute inset-0 grid-bg opacity-60" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-transparent to-[#050505]" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#050505]" />

      {/* Top header */}
      <div className="absolute top-0 left-0 right-0 px-8 py-5 flex items-center justify-between z-10">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-[6px] bg-[#007AFF] grid place-items-center glow-blue">
            <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-display font-bold tracking-tight text-lg">Agentspace</span>
        </div>
        <div className="font-mono-code text-[11px] text-white/40 uppercase tracking-wider">
          v0.1 · gen-ui builder
        </div>
      </div>

      <div className="relative z-10 m-auto w-full max-w-[1100px] px-8 grid lg:grid-cols-2 gap-16 items-center">
        {/* Left: pitch */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="space-y-7"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#39FF14] glow-green animate-pulse" />
            <span className="font-mono-code text-[11px] tracking-wider uppercase text-white/70">
              Powered by Gemini 3
            </span>
          </div>

          <h1 className="font-display font-bold leading-[0.95] tracking-tight text-5xl lg:text-6xl">
            Generative UI,
            <br />
            <span className="text-white/50">rendered in real time.</span>
          </h1>

          <p className="text-white/60 text-[15px] leading-relaxed max-w-md">
            A futuristic, dark-themed workspace for building React artifacts with AI. Chat on the
            left, live-rendered components on the right.
          </p>

          <div className="grid grid-cols-3 gap-3 max-w-md pt-2">
            {[
              { icon: Cpu, label: "Thinking Mode", color: "#00FFFF" },
              { icon: Zap, label: "Low Latency", color: "#39FF14" },
              { icon: Code2, label: "Live Artifacts", color: "#007AFF" },
            ].map((f) => (
              <div
                key={f.label}
                className="border border-white/10 bg-white/[0.02] p-3 hover:bg-white/[0.04] transition"
              >
                <f.icon className="h-4 w-4 mb-2" style={{ color: f.color }} />
                <div className="font-mono-code text-[10.5px] uppercase tracking-wider text-white/60">
                  {f.label}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Right: login card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.1, ease: "easeOut" }}
          className="relative"
        >
          <div className="absolute -inset-px bg-gradient-to-br from-[#007AFF]/40 via-transparent to-[#00FFFF]/20 blur-xl opacity-50" />
          <div className="relative border border-white/10 bg-[#0A0A0A]/80 backdrop-blur-xl p-8">
            <div className="space-y-1 mb-7">
              <div className="font-mono-code text-[11px] tracking-widest uppercase text-[#007AFF]">
                /auth/init
              </div>
              <h2 className="font-display text-2xl font-bold">Enter the workspace</h2>
              <p className="text-white/50 text-sm">
                Sign in with Google to persist your workspaces and chat history.
              </p>
            </div>

            <Button
              data-testid="login-google-button"
              onClick={handleLogin}
              className="w-full h-12 bg-white text-black hover:bg-white/90 rounded-md font-medium text-[14px] flex items-center justify-center gap-3"
            >
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path
                  fill="#4285F4"
                  d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
                />
                <path
                  fill="#34A853"
                  d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
                />
                <path
                  fill="#FBBC05"
                  d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                />
                <path
                  fill="#EA4335"
                  d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
                />
              </svg>
              Continue with Google
            </Button>

            <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-between">
              <div className="font-mono-code text-[10.5px] text-white/40 uppercase tracking-wider">
                Press
              </div>
              <div className="flex items-center gap-1.5">
                <kbd className="kbd">⌘</kbd>
                <kbd className="kbd">K</kbd>
                <span className="text-white/40 text-xs ml-1">for shortcuts (post-login)</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 px-8 py-4 flex items-center justify-between z-10 font-mono-code text-[10.5px] uppercase tracking-widest text-white/35 border-t border-white/5">
        <span>offline-first · react · framer-motion · react-live</span>
        <span>gemini-3.1-pro-preview · gemini-3.1-flash-lite-preview</span>
      </div>
    </div>
  );
}
