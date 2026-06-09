import React, { useState, useMemo, useEffect, useCallback } from "react";
import { LiveProvider, LivePreview, LiveError, LiveEditor } from "react-live";
import { themes } from "prism-react-renderer";
import { motion, AnimatePresence } from "framer-motion";
import * as Lucide from "lucide-react";
import {
  Copy,
  Check,
  Code as CodeIcon,
  Play,
  Sparkles,
  AlertCircle,
  Eye,
  FileCode2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

/**
 * Extract the first code block tagged as `tsx artifact`, `jsx artifact`, `tsx`, or `jsx`
 * from a markdown response.
 */
export function extractArtifact(markdown) {
  if (!markdown) return null;
  const re = /```(tsx artifact|jsx artifact|tsx|jsx|javascript|js)\n?([\s\S]*?)```/g;
  const matches = [];
  let m;
  while ((m = re.exec(markdown)) !== null) {
    matches.push({ tag: m[1], code: m[2] });
  }
  if (matches.length === 0) return null;
  // Prefer "artifact" tagged ones
  const tagged = matches.find((x) => x.tag.includes("artifact"));
  return (tagged || matches[0]).code.trim();
}

/**
 * Sanitize generated TSX/JSX code to run inside react-live noInline mode.
 * - Strip `import ...` lines
 * - Strip `export default ...` / `export ...` statements
 * - Ensure final `render(<App/>);` exists
 */
export function prepareCode(raw) {
  if (!raw) return "";
  let code = raw;
  // remove import lines
  code = code.replace(/^\s*import[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "");
  code = code.replace(/^\s*import\s+["'][^"']+["'];?\s*$/gm, "");
  // remove export default keyword (keep value)
  code = code.replace(/export\s+default\s+/g, "");
  // remove "export " from `export const X =`
  code = code.replace(/^\s*export\s+(const|function|let|var)\s+/gm, "$1 ");
  // remove any TypeScript type annotations? We keep them — Babel can typically handle some,
  // but to be safe strip ": React.FC" style. Live transform via Babel/Sucrase handles JSX.
  // Detect the component name we should render.
  const trimmed = code.trim();
  if (/\brender\s*\(/.test(trimmed)) return trimmed;

  // Try to find a component named App; else find first capitalized function/const.
  let compName = null;
  if (/\b(?:function|const|let|var)\s+App\b/.test(trimmed)) compName = "App";
  if (!compName) {
    const fnMatch = trimmed.match(/\bfunction\s+([A-Z]\w*)\b/);
    const constMatch = trimmed.match(/\b(?:const|let|var)\s+([A-Z]\w*)\s*=/);
    compName = (fnMatch && fnMatch[1]) || (constMatch && constMatch[1]) || "App";
  }
  return `${trimmed}\nrender(<${compName} />);`;
}

const liveTheme = {
  ...themes.vsDark,
  plain: { ...themes.vsDark.plain, backgroundColor: "transparent" },
};

const scope = {
  React,
  useState,
  useMemo,
  useEffect,
  useCallback,
  motion,
  AnimatePresence,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Input,
  Badge,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  ScrollArea,
  Separator,
  Skeleton,
  Switch,
  Slider,
  // All lucide icons
  ...Lucide,
};

function EmptyState() {
  return (
    <div
      className="h-full w-full flex flex-col items-center justify-center text-center px-8 relative overflow-hidden"
      data-testid="artifact-empty-state"
    >
      <div className="absolute inset-0 grid-bg opacity-50 pointer-events-none" />
      <div className="relative z-10">
        <div className="h-12 w-12 mx-auto mb-5 border border-white/10 grid place-items-center">
          <Sparkles className="h-5 w-5 text-[#007AFF] glow-blue" />
        </div>
        <div className="font-mono-code text-[10.5px] uppercase tracking-widest text-white/40 mb-3">
          /artifact/idle
        </div>
        <h3 className="font-display text-2xl font-bold mb-2">Awaiting generation</h3>
        <p className="text-white/50 text-sm max-w-sm">
          Ask Agentspace to build a component. The live preview will materialize here in real time.
        </p>
      </div>
    </div>
  );
}

export default function Artifact({ code, isStreaming }) {
  const [tab, setTab] = useState("preview");
  const [copied, setCopied] = useState(false);

  const prepared = useMemo(() => prepareCode(code), [code]);

  // Auto-switch to preview when code becomes ready
  useEffect(() => {
    if (code && !isStreaming) setTab("preview");
  }, [code, isStreaming]);

  const handleCopy = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!code) {
    return (
      <div className="h-full flex flex-col bg-[#0A0A0A]">
        <ArtifactHeader />
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#0A0A0A]" data-testid="artifact-panel">
      <ArtifactHeader>
        <div className="flex items-center gap-2">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="bg-[#050505] border border-white/10 h-8 p-0.5 rounded-md">
              <TabsTrigger
                value="preview"
                data-testid="tab-preview"
                className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50 text-xs h-7 px-3 rounded-sm gap-1.5 font-mono-code uppercase tracking-wider"
              >
                <Eye className="h-3 w-3" /> Preview
              </TabsTrigger>
              <TabsTrigger
                value="code"
                data-testid="tab-code"
                className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50 text-xs h-7 px-3 rounded-sm gap-1.5 font-mono-code uppercase tracking-wider"
              >
                <FileCode2 className="h-3 w-3" /> Code
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <button
            onClick={handleCopy}
            data-testid="copy-code-button"
            className="h-8 w-8 grid place-items-center border border-white/10 hover:bg-white/5 rounded-md transition"
            title="Copy code"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-[#39FF14]" /> : <Copy className="h-3.5 w-3.5 text-white/60" />}
          </button>
        </div>
      </ArtifactHeader>

      <div className="flex-1 overflow-hidden relative">
        <LiveProvider code={prepared} scope={scope} noInline={true} theme={liveTheme}>
          <AnimatePresence mode="wait">
            {tab === "preview" ? (
              <motion.div
                key="preview"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="absolute inset-0 overflow-auto live-preview-host"
              >
                <div className="p-6 min-h-full">
                  <LivePreview data-testid="live-preview" />
                </div>
                <LiveError
                  data-testid="live-error"
                  className="absolute bottom-0 left-0 right-0 max-h-40 overflow-auto bg-red-950/80 backdrop-blur border-t border-red-500/30 text-red-200 font-mono-code text-[11px] p-3 whitespace-pre-wrap"
                />
              </motion.div>
            ) : (
              <motion.div
                key="code"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="absolute inset-0 overflow-auto bg-[#050505]"
                data-testid="code-view"
              >
                <div className="code-block">
                  <LiveEditor
                    style={{
                      background: "transparent",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 13,
                      lineHeight: 1.6,
                      minHeight: "100%",
                    }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </LiveProvider>
      </div>
    </div>
  );
}

function ArtifactHeader({ children }) {
  return (
    <div className="h-14 px-4 border-b border-white/10 flex items-center justify-between bg-[#0A0A0A]">
      <div className="flex items-center gap-2.5">
        <div className="h-6 w-6 border border-white/10 grid place-items-center">
          <Play className="h-3 w-3 text-[#007AFF]" />
        </div>
        <div>
          <div className="font-mono-code text-[10.5px] uppercase tracking-widest text-white/40 leading-none mb-0.5">
            /artifact
          </div>
          <div className="font-display text-[13px] font-medium leading-none">Live Render</div>
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}
