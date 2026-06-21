import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Plus,
  Trash2,
  LogOut,
  Cpu,
  Zap,
  Search as SearchIcon,
  Command as CmdIcon,
  Bot,
  ChevronRight,
  Settings2,
  MessageSquare,
  Shield,
  ChevronDown,
  CircuitBoard,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { api, streamChat } from "@/lib/api";
import Chat from "@/components/Chat";
import Artifact, { extractArtifact } from "@/components/Artifact";
import CommandPalette from "@/components/CommandPalette";

const MODE_LABELS = {
  pro: { label: "Thinking", color: "#FFFF00", icon: Cpu, model: "gemini-3.1-pro-preview" },
  flash: { label: "Flash", color: "#39FF14", icon: Zap, model: "gemini-3.1-flash-lite-preview" },
};

export default function Workspace() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingState, setStreamingState] = useState("initializing");
  const [mode, setMode] = useState("pro");
  const [enableGrounding, setEnableGrounding] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [artifactCode, setArtifactCode] = useState(null);
  const [activeProvider, setActiveProvider] = useState(null); // OpenAI-compatible override
  const [isAdmin, setIsAdmin] = useState(false);

  const streamCtrlRef = useRef(null);
  const stagingAssistant = useRef(""); // current streaming content

  // Load active provider + admin status
  useEffect(() => {
    (async () => {
      try {
        const list = await api.listProviders();
        const active = list.find((p) => p.is_active) || null;
        setActiveProvider(active);
      } catch {}
      try {
        const m = await api.adminMe();
        setIsAdmin(!!m.is_admin);
      } catch {}
    })();
  }, []);

  const usingOpenAI = !!activeProvider;
  const effectiveModelLabel = usingOpenAI ? activeProvider.model : (mode === "pro" ? "gemini-3.1-pro-preview" : "gemini-3.1-flash-lite-preview");

  // Bootstrap sessions list
  useEffect(() => {
    (async () => {
      try {
        const list = await api.listSessions();
        setSessions(list);
        if (list.length > 0) {
          await loadSession(list[0].session_id);
        } else {
          const s = await api.createChatSession("New Workspace");
          setSessions([s]);
          setActiveId(s.session_id);
          setMessages([]);
          setArtifactCode(null);
        }
      } catch (e) {
        console.error(e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSession = async (id) => {
    setActiveId(id);
    try {
      const msgs = await api.getMessages(id);
      setMessages(msgs);
      // Extract last artifact from assistant messages
      const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant");
      const art = lastAssistant ? extractArtifact(lastAssistant.content) : null;
      setArtifactCode(art);
    } catch (e) {
      console.error(e);
    }
  };

  const handleNewWorkspace = useCallback(async () => {
    try {
      const s = await api.createChatSession("New Workspace");
      setSessions((prev) => [s, ...prev]);
      setActiveId(s.session_id);
      setMessages([]);
      setArtifactCode(null);
      toast.success("New workspace created");
    } catch {
      toast.error("Failed to create workspace");
    }
  }, []);

  const handleDeleteSession = useCallback(
    async (id) => {
      try {
        await api.deleteChatSession(id);
        setSessions((prev) => prev.filter((s) => s.session_id !== id));
        if (id === activeId) {
          const remaining = sessions.filter((s) => s.session_id !== id);
          if (remaining.length > 0) await loadSession(remaining[0].session_id);
          else await handleNewWorkspace();
        }
      } catch {
        toast.error("Delete failed");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, sessions]
  );

  const handleLogout = useCallback(async () => {
    // Auth disabled — logout is a no-op
    toast.info("Auth is disabled in local mode");
  }, []);

  const handleStop = useCallback(() => {
    if (streamCtrlRef.current) {
      streamCtrlRef.current.abort();
      streamCtrlRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const handleSend = useCallback(
    (prompt) => {
      if (!activeId) return;

      const userMsg = { role: "user", content: prompt };
      const baseMessages = [...messages, userMsg];
      setMessages(baseMessages);
      setIsStreaming(true);
      setStreamingState("initializing");
      stagingAssistant.current = "";

      // History for the model (last 10 turns)
      const history = baseMessages.slice(-20, -1).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const ctrl = streamChat(
        {
          sessionId: activeId,
          prompt,
          mode,
          enableGrounding: usingOpenAI ? false : enableGrounding,
          history,
        },
        (evt) => {
          if (evt.type === "status") {
            setStreamingState(evt.state);
          } else if (evt.type === "delta") {
            stagingAssistant.current += evt.text;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "assistant") {
                return [...prev.slice(0, -1), { ...last, content: stagingAssistant.current }];
              }
              return [
                ...prev,
                {
                  role: "assistant",
                  content: stagingAssistant.current,
                  model: MODE_LABELS[mode].model,
                  citations: [],
                },
              ];
            });
            // Try extracting artifact progressively
            const art = extractArtifact(stagingAssistant.current);
            if (art) setArtifactCode(art);
          } else if (evt.type === "citation") {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (!last || last.role !== "assistant") return prev;
              const citations = [...(last.citations || []), evt.citation];
              return [...prev.slice(0, -1), { ...last, citations }];
            });
          } else if (evt.type === "done") {
            setIsStreaming(false);
            streamCtrlRef.current = null;
            // Final artifact extraction
            const art = extractArtifact(stagingAssistant.current);
            setArtifactCode(art);
            // Update session title from first user message if untitled
            if (messages.length === 0 && activeId) {
              const title = prompt.length > 40 ? prompt.slice(0, 40) + "..." : prompt;
              api.renameSession(activeId, title).then(() => {
                setSessions((prev) =>
                  prev.map((s) => (s.session_id === activeId ? { ...s, title } : s))
                );
              });
            }
          } else if (evt.type === "error") {
            toast.error(evt.message || "Stream error");
            setIsStreaming(false);
            streamCtrlRef.current = null;
          }
        }
      );
      streamCtrlRef.current = ctrl;
    },
    [activeId, messages, mode, enableGrounding, usingOpenAI]
  );

  // Tab control proxy for command palette
  const [artifactTab, setArtifactTab] = useState(null); // (unused with internal tab state—reserved)

  const M = MODE_LABELS[mode];

  return (
    <div className="h-screen w-screen flex flex-col bg-[#050505] text-white overflow-hidden" data-testid="workspace">
      {/* HEADER */}
      <header className="h-14 border-b border-white/10 px-4 flex items-center justify-between bg-[#050505] shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-md bg-[#007AFF] grid place-items-center glow-blue">
            <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <div className="font-display font-bold tracking-tight text-[15px] leading-none">
              Agentspace
            </div>
            <div className="font-mono-code text-[9.5px] uppercase tracking-widest text-white/40 leading-none mt-1">
              gen-ui builder
            </div>
          </div>
        </div>

        {/* Center: mode + grounding OR provider badge */}
        <div className="flex items-center gap-2">
          {usingOpenAI ? (
            <div
              data-testid="active-provider-badge"
              className="h-8 px-3 border border-[#39FF14]/40 bg-[#39FF14]/[0.05] rounded-md flex items-center gap-2 font-mono-code text-[11px] uppercase tracking-wider text-[#39FF14] glow-green"
            >
              <CircuitBoard className="h-3 w-3" />
              <span>{activeProvider.name}</span>
              <span className="text-white/40 normal-case tracking-normal">·</span>
              <span className="text-white/80 normal-case tracking-normal">{activeProvider.model}</span>
            </div>
          ) : (
            <>
              <div className="flex border border-white/10 rounded-md overflow-hidden h-8" data-testid="mode-toggle-group">
                <button
                  data-testid="mode-pro-button"
                  onClick={() => setMode("pro")}
                  className={`px-3 h-full text-[11px] font-mono-code uppercase tracking-wider flex items-center gap-1.5 transition ${
                    mode === "pro" ? "bg-white/10 text-[#FFFF00]" : "text-white/50 hover:text-white"
                  }`}
                >
                  <Cpu className="h-3 w-3" /> Thinking
                </button>
                <div className="w-px bg-white/10" />
                <button
                  data-testid="mode-flash-button"
                  onClick={() => setMode("flash")}
                  className={`px-3 h-full text-[11px] font-mono-code uppercase tracking-wider flex items-center gap-1.5 transition ${
                    mode === "flash" ? "bg-white/10 text-[#39FF14]" : "text-white/50 hover:text-white"
                  }`}
                >
                  <Zap className="h-3 w-3" /> Flash
                </button>
              </div>

              <button
                data-testid="grounding-toggle"
                onClick={() => setEnableGrounding((v) => !v)}
                className={`h-8 px-3 border rounded-md text-[11px] font-mono-code uppercase tracking-wider flex items-center gap-1.5 transition ${
                  enableGrounding
                    ? "border-[#00FFFF]/50 text-[#00FFFF] bg-[#00FFFF]/[0.06]"
                    : "border-white/10 text-white/50 hover:text-white"
                }`}
              >
                <SearchIcon className="h-3 w-3" /> Grounding
              </button>
            </>
          )}
        </div>

        {/* Right: command palette trigger + user dropdown */}
        <div className="flex items-center gap-2">
          <button
            data-testid="cmd-palette-trigger"
            onClick={() => setPaletteOpen(true)}
            className="h-8 px-2.5 border border-white/10 rounded-md text-[11px] text-white/60 hover:text-white hover:bg-white/5 transition flex items-center gap-2"
          >
            <CmdIcon className="h-3 w-3" />
            <span className="font-mono-code">Commands</span>
            <span className="flex items-center gap-0.5">
              <kbd className="kbd">⌘</kbd>
              <kbd className="kbd">K</kbd>
            </span>
          </button>

          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  data-testid="user-menu-trigger"
                  className="h-8 pl-2 pr-2 ml-1 border-l border-white/10 flex items-center gap-2 hover:bg-white/5 rounded-r-md transition"
                >
                  <div className="h-6 w-6 rounded-md bg-white/10 grid place-items-center text-xs">
                    <CircuitBoard className="h-3.5 w-3.5 text-[#007AFF]" />
                  </div>
                  <span className="text-[12px] text-white/70 hidden md:inline">Local</span>
                  <ChevronDown className="h-3 w-3 text-white/50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                data-testid="user-menu"
                className="bg-[#0A0A0A] border-white/10 text-white min-w-[200px]"
              >
                <DropdownMenuLabel className="font-mono-code text-[10px] uppercase tracking-widest text-white/40 px-2 py-1.5">
                  Local mode
                </DropdownMenuLabel>
                <div className="px-2 pb-2 text-[12px] text-white/70 truncate">Auth disabled</div>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem
                  data-testid="menu-settings"
                  onClick={() => navigate("/settings")}
                  className="cursor-pointer focus:bg-white/5 gap-2 text-[12.5px]"
                >
                  <Settings2 className="h-3.5 w-3.5 text-[#007AFF]" /> Provider Settings
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-testid="menu-admin"
                  onClick={() => navigate("/admin")}
                  className="cursor-pointer focus:bg-white/5 gap-2 text-[12.5px]"
                >
                  <Shield className="h-3.5 w-3.5 text-[#FFFF00]" /> Admin Panel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      {/* BODY */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sessions sidebar */}
        <aside className="w-[220px] border-r border-white/10 bg-[#050505] flex flex-col shrink-0" data-testid="sessions-sidebar">
          <div className="p-3 border-b border-white/10">
            <Button
              onClick={handleNewWorkspace}
              data-testid="new-workspace-button"
              size="sm"
              className="w-full h-9 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-mono-code text-[11px] uppercase tracking-wider gap-1.5 rounded-md"
            >
              <Plus className="h-3.5 w-3.5" /> New Workspace
              <span className="ml-auto flex items-center gap-0.5">
                <kbd className="kbd">⌘</kbd>
                <kbd className="kbd">N</kbd>
              </span>
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            <div className="font-mono-code text-[9.5px] uppercase tracking-widest text-white/30 px-2 py-1.5">
              Recent
            </div>
            {sessions.length === 0 && (
              <div className="text-white/30 text-xs px-2 py-2">No workspaces yet</div>
            )}
            {sessions.map((s) => (
              <div
                key={s.session_id}
                className={`group flex items-center justify-between gap-1 px-2 py-1.5 rounded-md cursor-pointer transition ${
                  activeId === s.session_id
                    ? "bg-[#007AFF]/10 border border-[#007AFF]/30"
                    : "hover:bg-white/[0.04] border border-transparent"
                }`}
                onClick={() => loadSession(s.session_id)}
                data-testid={`session-item-${s.session_id}`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <MessageSquare className="h-3 w-3 text-white/40 shrink-0" />
                  <span className="text-[12px] text-white/80 truncate">{s.title}</span>
                </div>
                <button
                  data-testid={`delete-session-${s.session_id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteSession(s.session_id);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition h-5 w-5 grid place-items-center hover:bg-red-500/10 rounded-sm"
                >
                  <Trash2 className="h-3 w-3 text-red-400/70" />
                </button>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-white/10 font-mono-code text-[10px] text-white/40 leading-relaxed">
            <div className="truncate">{effectiveModelLabel}</div>
            <div className="text-white/30">offline-first · v0.1</div>
          </div>
        </aside>

        {/* Chat panel */}
        <div className="w-[420px] border-r border-white/10 flex flex-col shrink-0">
          <Chat
            messages={messages}
            onSend={handleSend}
            isStreaming={isStreaming}
            streamingState={streamingState}
            onStop={handleStop}
            mode={mode}
            enableGrounding={enableGrounding}
            usingOpenAI={usingOpenAI}
            providerLabel={activeProvider?.name}
            providerModel={activeProvider?.model}
          />
        </div>

        {/* Artifact panel */}
        <div className="flex-1 min-w-0">
          <Artifact code={artifactCode} isStreaming={isStreaming} />
        </div>
      </div>

      <CommandPalette
        open={paletteOpen}
        setOpen={setPaletteOpen}
        onNewWorkspace={handleNewWorkspace}
        onClearLocal={() => {
          setMessages([]);
          setArtifactCode(null);
          toast.success("Local state cleared");
        }}
        onToggleMode={() => setMode((m) => (m === "pro" ? "flash" : "pro"))}
        onToggleGrounding={() => setEnableGrounding((v) => !v)}
        onLogout={handleLogout}
        onSwitchTab={() => {}}
        onOpenSettings={() => navigate("/settings")}
        onOpenAdmin={() => navigate("/admin")}
        isAdmin={isAdmin}
        currentMode={mode}
        groundingEnabled={enableGrounding}
      />
    </div>
  );
}
