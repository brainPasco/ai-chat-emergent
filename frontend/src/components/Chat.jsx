import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Square, User, Bot, Search, ExternalLink, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import TypingIndicator from "@/components/TypingIndicator";

function CitationCard({ cit, index }) {
  return (
    <a
      href={cit.uri}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={`citation-card-${index}`}
      className="block border border-[#FFFF00]/20 bg-[#FFFF00]/[0.03] hover:bg-[#FFFF00]/[0.06] transition rounded-md p-2.5 group"
    >
      <div className="flex items-start gap-2">
        <div className="h-5 w-5 grid place-items-center border border-[#FFFF00]/30 shrink-0 mt-0.5">
          <Search className="h-2.5 w-2.5 text-[#FFFF00]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] text-white/90 leading-snug line-clamp-2">{cit.title}</div>
          <div className="font-mono-code text-[10px] text-white/40 truncate mt-1 flex items-center gap-1">
            <span className="truncate">{cit.uri}</span>
            <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-0 group-hover:opacity-100 transition" />
          </div>
        </div>
      </div>
    </a>
  );
}

function MessageBubble({ msg, isStreaming }) {
  const isUser = msg.role === "user";
  // strip code blocks from content for cleaner chat display (artifact is shown on right)
  const cleaned = (msg.content || "").replace(/```[\s\S]*?```/g, "").trim();
  const displayText = cleaned || (msg.content && msg.content.includes("```") ? "Component generated →" : msg.content);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`flex gap-3 ${isUser ? "" : ""}`}
      data-testid={isUser ? "msg-user" : "msg-assistant"}
    >
      <div className="shrink-0 mt-0.5">
        {isUser ? (
          <div className="h-7 w-7 rounded-md bg-white/5 border border-white/10 grid place-items-center">
            <User className="h-3.5 w-3.5 text-white/70" />
          </div>
        ) : (
          <div className="h-7 w-7 rounded-md bg-[#007AFF]/10 border border-[#007AFF]/30 grid place-items-center glow-blue">
            <Bot className="h-3.5 w-3.5 text-[#007AFF]" />
          </div>
        )}
      </div>
      <div className={`flex-1 min-w-0 ${isUser ? "" : "border-l-2 border-[#007AFF]/40 pl-3 -ml-2"}`}>
        <div className="font-mono-code text-[10px] uppercase tracking-widest text-white/35 mb-1">
          {isUser ? "you" : msg.model || "agentspace"}
        </div>
        {displayText ? (
          <div className="text-[14px] text-white/85 leading-relaxed whitespace-pre-wrap break-words">
            {displayText}
            {isStreaming && !isUser && (
              <span className="inline-block ml-1 w-1.5 h-3.5 bg-[#39FF14] glow-green align-middle animate-pulse" />
            )}
          </div>
        ) : isStreaming && !isUser ? (
          <div className="text-[13px] text-white/40 italic">Composing artifact...</div>
        ) : null}

        {msg.citations && msg.citations.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <div className="font-mono-code text-[10px] uppercase tracking-widest text-[#FFFF00]/70">
              Sources · {msg.citations.length}
            </div>
            <div className="space-y-1.5">
              {msg.citations.map((c, i) => (
                <CitationCard key={i} cit={c} index={i} />
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function Chat({
  messages,
  onSend,
  isStreaming,
  streamingState,
  onStop,
  mode,
  enableGrounding,
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);
  const taRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, streamingState]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!input.trim() || isStreaming) return;
    onSend(input.trim());
    setInput("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const suggestions = [
    "Build a pricing card with 3 tiers",
    "Animated counter with framer-motion",
    "Dashboard stats grid with sparklines",
  ];

  return (
    <div className="h-full flex flex-col bg-[#050505]" data-testid="chat-panel">
      {/* Scrollable history */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5">
        {messages.length === 0 && !isStreaming && (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 -mt-8">
            <div className="h-10 w-10 mb-4 border border-white/10 grid place-items-center">
              <Sparkles className="h-4 w-4 text-[#007AFF] glow-blue" />
            </div>
            <div className="font-mono-code text-[10.5px] uppercase tracking-widest text-white/40 mb-2">
              /workspace/new
            </div>
            <h3 className="font-display text-xl font-bold mb-2">What shall we generate?</h3>
            <p className="text-white/45 text-[13px] max-w-xs mb-5">
              Describe a UI, component, or interaction. The artifact will render live on the right.
            </p>
            <div className="space-y-1.5 w-full max-w-xs">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  data-testid={`suggestion-${i}`}
                  onClick={() => setInput(s)}
                  className="w-full text-left text-[12.5px] text-white/65 hover:text-white border border-white/10 hover:border-white/25 bg-white/[0.02] hover:bg-white/[0.04] px-3 py-2 transition font-mono-code"
                >
                  → {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-5">
          <AnimatePresence initial={false}>
            {messages.map((m, i) => {
              const last = i === messages.length - 1;
              return (
                <MessageBubble
                  key={i}
                  msg={m}
                  isStreaming={isStreaming && last && m.role === "assistant"}
                />
              );
            })}
          </AnimatePresence>

          {isStreaming && (messages.length === 0 || messages[messages.length - 1].role === "user") && (
            <div className="flex gap-3">
              <div className="h-7 w-7 rounded-md bg-[#007AFF]/10 border border-[#007AFF]/30 grid place-items-center glow-blue">
                <Bot className="h-3.5 w-3.5 text-[#007AFF]" />
              </div>
              <div className="border-l-2 border-[#007AFF]/40 pl-3 -ml-2 flex items-center">
                <TypingIndicator state={streamingState} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input bar */}
      <div className="border-t border-white/10 p-3 bg-[#050505]">
        <form onSubmit={handleSubmit} className="relative">
          <div className="border border-white/10 focus-within:border-[#007AFF]/50 bg-[#0A0A0A] transition rounded-md">
            <textarea
              ref={taRef}
              data-testid="chat-input"
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe a component... (Shift+Enter for newline)"
              disabled={isStreaming}
              className="w-full bg-transparent resize-none outline-none px-3 py-2.5 text-[13.5px] text-white placeholder:text-white/30 font-mono-code disabled:opacity-50"
            />
            <div className="flex items-center justify-between px-2 py-1.5 border-t border-white/5">
              <div className="flex items-center gap-1.5 font-mono-code text-[10px] uppercase tracking-widest text-white/40">
                <span className={`px-1.5 py-0.5 border ${mode === "pro" ? "border-[#FFFF00]/40 text-[#FFFF00]" : "border-[#39FF14]/40 text-[#39FF14]"}`}>
                  {mode === "pro" ? "Thinking" : "Flash"}
                </span>
                {enableGrounding && (
                  <span className="px-1.5 py-0.5 border border-[#00FFFF]/40 text-[#00FFFF]">Grounding</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {isStreaming ? (
                  <Button
                    type="button"
                    data-testid="stop-button"
                    onClick={onStop}
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 border-white/15 bg-transparent text-white/80 hover:bg-white/5 gap-1.5"
                  >
                    <Square className="h-3 w-3 fill-current" /> Stop
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    data-testid="send-message-button"
                    disabled={!input.trim()}
                    size="sm"
                    className="h-7 px-3 bg-[#007AFF] hover:bg-[#0a84ff] text-white disabled:opacity-40 gap-1.5"
                  >
                    <Send className="h-3 w-3" /> Send
                  </Button>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
