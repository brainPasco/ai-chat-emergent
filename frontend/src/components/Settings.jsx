import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Check,
  Loader2,
  Zap,
  Eye,
  EyeOff,
  CircleDot,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

const PRESETS = [
  { label: "OpenAI", base_url: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { label: "OpenRouter", base_url: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
  { label: "Groq", base_url: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  { label: "Together AI", base_url: "https://api.together.xyz/v1", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
  { label: "Local (LM Studio)", base_url: "http://localhost:1234/v1", model: "local-model" },
];

function FieldRow({ label, hint, children }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label className="font-mono-code text-[10.5px] uppercase tracking-widest text-white/50">
          {label}
        </label>
        {hint && <span className="font-mono-code text-[10px] text-white/30">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function ProviderForm({ onCreate, busy }) {
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [setActive, setSetActive] = useState(true);

  const applyPreset = (p) => {
    setName(p.label);
    setBaseUrl(p.base_url);
    setModel(p.model);
  };

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim() || !baseUrl.trim() || !apiKey.trim() || !model.trim()) {
      toast.error("All fields required");
      return;
    }
    onCreate({
      name: name.trim(),
      base_url: baseUrl.trim(),
      api_key: apiKey.trim(),
      model: model.trim(),
      is_active: setActive,
    });
    setName(""); setBaseUrl(""); setApiKey(""); setModel(""); setSetActive(true);
  };

  return (
    <form
      onSubmit={submit}
      className="border border-white/10 bg-[#0A0A0A] rounded-md p-5 space-y-4"
      data-testid="provider-form"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono-code text-[10.5px] uppercase tracking-widest text-[#007AFF]">
            /provider/new
          </div>
          <div className="font-display text-lg font-bold mt-1">Add OpenAI-compatible endpoint</div>
        </div>
        <Plus className="h-4 w-4 text-white/40" />
      </div>

      {/* Presets */}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p)}
            data-testid={`preset-${p.label.toLowerCase().replace(/[^a-z]/g, "-")}`}
            className="px-2.5 py-1 border border-white/10 hover:border-[#007AFF]/40 hover:bg-[#007AFF]/[0.06] rounded-md font-mono-code text-[10.5px] uppercase tracking-wider text-white/60 hover:text-white transition"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="Name">
          <Input
            data-testid="provider-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="OpenAI Production"
            className="bg-[#050505] border-white/10 font-mono-code text-[13px] h-9"
          />
        </FieldRow>
        <FieldRow label="Model">
          <Input
            data-testid="provider-model-input"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gpt-4o-mini"
            className="bg-[#050505] border-white/10 font-mono-code text-[13px] h-9"
          />
        </FieldRow>
      </div>

      <FieldRow label="Base URL" hint="OpenAI-compatible /v1 endpoint">
        <Input
          data-testid="provider-base-url-input"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.openai.com/v1"
          className="bg-[#050505] border-white/10 font-mono-code text-[13px] h-9"
        />
      </FieldRow>

      <FieldRow label="API Key" hint="Stored server-side, never re-shown">
        <div className="relative">
          <Input
            data-testid="provider-api-key-input"
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="bg-[#050505] border-white/10 font-mono-code text-[13px] h-9 pr-10"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
          >
            {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
      </FieldRow>

      <div className="flex items-center justify-between pt-1 border-t border-white/5">
        <label className="flex items-center gap-2 text-[13px] text-white/70 cursor-pointer">
          <Switch
            data-testid="provider-set-active"
            checked={setActive}
            onCheckedChange={setSetActive}
          />
          Set as active provider
        </label>
        <Button
          type="submit"
          data-testid="provider-submit-button"
          disabled={busy}
          className="bg-[#007AFF] hover:bg-[#0a84ff] text-white h-9 gap-1.5"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Save Provider
        </Button>
      </div>
    </form>
  );
}

function ProviderCard({ p, onSetActive, onDelete, onTest }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await onTest(p.provider_id);
      setResult(res);
      if (res.ok) toast.success(`${p.name}: connection OK`);
      else toast.error(`${p.name}: ${res.status} ${res.body?.slice(0, 80) || ""}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className={`border ${p.is_active ? "border-[#39FF14]/30 bg-[#39FF14]/[0.03]" : "border-white/10 bg-[#0A0A0A]"} rounded-md p-4`}
      data-testid={`provider-card-${p.provider_id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {p.is_active ? (
              <span className="h-1.5 w-1.5 rounded-full bg-[#39FF14] glow-green animate-pulse" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
            )}
            <span className="font-display text-[15px] font-bold">{p.name}</span>
            {p.is_active && (
              <Badge className="bg-[#39FF14]/15 text-[#39FF14] border-[#39FF14]/30 hover:bg-[#39FF14]/20 font-mono-code text-[9.5px] uppercase tracking-wider px-1.5 py-0">
                Active
              </Badge>
            )}
          </div>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 font-mono-code text-[11.5px]">
            <div className="text-white/40">
              base_url: <span className="text-white/80 break-all">{p.base_url}</span>
            </div>
            <div className="text-white/40">
              model: <span className="text-white/80">{p.model}</span>
            </div>
            <div className="text-white/40 col-span-full">
              api_key: <span className="text-white/80">{p.api_key_masked || "(unset)"}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {!p.is_active && (
            <Button
              size="sm"
              variant="outline"
              data-testid={`set-active-${p.provider_id}`}
              onClick={() => onSetActive(p.provider_id)}
              className="h-7 px-2.5 border-white/10 bg-transparent hover:bg-white/5 text-[11px] font-mono-code uppercase tracking-wider"
            >
              Set Active
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            data-testid={`test-provider-${p.provider_id}`}
            onClick={handleTest}
            disabled={testing}
            className="h-7 px-2.5 border-white/10 bg-transparent hover:bg-white/5 text-[11px] font-mono-code uppercase tracking-wider gap-1.5"
          >
            {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
            Test
          </Button>
          <Button
            size="sm"
            variant="outline"
            data-testid={`delete-provider-${p.provider_id}`}
            onClick={() => onDelete(p.provider_id)}
            className="h-7 px-2.5 border-red-500/20 bg-transparent hover:bg-red-500/10 text-red-400 text-[11px] font-mono-code uppercase tracking-wider gap-1.5"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </Button>
        </div>
      </div>
      {result && (
        <div className={`mt-3 pt-3 border-t border-white/5 font-mono-code text-[10.5px] ${result.ok ? "text-[#39FF14]" : "text-red-400"}`}>
          {result.ok ? "✓" : "✗"} HTTP {result.status} · {(result.body || "").slice(0, 160)}
        </div>
      )}
    </motion.div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    try {
      const list = await api.listProviders();
      setProviders(list);
    } catch (e) {
      toast.error("Failed to load providers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const handleCreate = async (body) => {
    setBusy(true);
    try {
      await api.createProvider(body);
      toast.success("Provider added");
      await reload();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to add provider");
    } finally {
      setBusy(false);
    }
  };

  const handleSetActive = async (id) => {
    try {
      await api.updateProvider(id, { is_active: true });
      await reload();
    } catch {
      toast.error("Failed to activate");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this provider?")) return;
    try {
      await api.deleteProvider(id);
      toast.success("Provider deleted");
      await reload();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleTest = (id) => api.testProvider(id);

  const activeProvider = providers.find((p) => p.is_active);

  return (
    <div className="h-screen w-screen bg-[#050505] text-white overflow-y-auto" data-testid="settings-screen">
      {/* Header */}
      <header className="h-14 border-b border-white/10 px-4 flex items-center justify-between bg-[#050505] sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button
            data-testid="back-to-workspace"
            onClick={() => navigate("/workspace")}
            className="h-8 w-8 grid place-items-center border border-white/10 hover:bg-white/5 rounded-md"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-white/70" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-md bg-[#007AFF] grid place-items-center glow-blue">
              <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-display font-bold tracking-tight text-[15px] leading-none">Settings</div>
              <div className="font-mono-code text-[9.5px] uppercase tracking-widest text-white/40 leading-none mt-1">
                /providers
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {/* Active provider banner */}
        <div className="border border-white/10 bg-[#0A0A0A] rounded-md p-4 flex items-center gap-4" data-testid="active-provider-banner">
          <div className="h-10 w-10 grid place-items-center border border-white/10 rounded-md">
            <CircleDot className={`h-4 w-4 ${activeProvider ? "text-[#39FF14] glow-green" : "text-[#FFFF00] glow-yellow"}`} />
          </div>
          <div className="flex-1">
            <div className="font-mono-code text-[10px] uppercase tracking-widest text-white/40">
              Current chat provider
            </div>
            <div className="font-display text-[15px] font-bold mt-0.5">
              {activeProvider ? (
                <>{activeProvider.name} <span className="text-white/40 font-mono-code text-[12px]">· {activeProvider.model}</span></>
              ) : (
                <>Google Gemini 3 <span className="text-white/40 font-mono-code text-[12px]">· default</span></>
              )}
            </div>
          </div>
          <div className="text-white/40 text-[12px] max-w-xs text-right">
            {activeProvider
              ? "OpenAI-compatible. Thinking/Grounding hidden."
              : "Using built-in Gemini. Add an OpenAI-compatible provider to override."}
          </div>
        </div>

        {/* Add form */}
        <ProviderForm onCreate={handleCreate} busy={busy} />

        {/* List */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="font-mono-code text-[10.5px] uppercase tracking-widest text-white/50">
              Your Providers · {providers.length}
            </div>
          </div>

          {loading && (
            <div className="text-white/40 text-sm font-mono-code">Loading...</div>
          )}

          {!loading && providers.length === 0 && (
            <div className="border border-white/10 bg-[#0A0A0A] rounded-md p-8 text-center" data-testid="providers-empty">
              <AlertCircle className="h-5 w-5 text-white/30 mx-auto mb-2" />
              <div className="text-white/50 text-sm">No providers yet. Add one above to use OpenAI-compatible models.</div>
            </div>
          )}

          <div className="space-y-2.5">
            <AnimatePresence initial={false}>
              {providers.map((p) => (
                <ProviderCard
                  key={p.provider_id}
                  p={p}
                  onSetActive={handleSetActive}
                  onDelete={handleDelete}
                  onTest={handleTest}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>

        <div className="pt-6 pb-12 border-t border-white/5 font-mono-code text-[10.5px] text-white/30 leading-relaxed">
          Note: API keys are stored server-side and masked in responses. Setting a provider Active routes
          all subsequent chat through that endpoint. Search Grounding and Thinking Mode are Gemini-only
          features and will be hidden while an OpenAI-compatible provider is active.
        </div>
      </div>
    </div>
  );
}
