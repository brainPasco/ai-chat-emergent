import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Plus,
  Trash2,
  LogOut,
  Cpu,
  Zap,
  Search,
  Eraser,
  Sparkles,
  Eye,
  Code,
  Settings2,
  Shield,
} from "lucide-react";

export default function CommandPalette({
  open,
  setOpen,
  onNewWorkspace,
  onClearLocal,
  onToggleMode,
  onToggleGrounding,
  onLogout,
  onSwitchTab,
  onOpenSettings,
  onOpenAdmin,
  isAdmin,
  currentMode,
  groundingEnabled,
}) {
  // Keyboard shortcut
  useEffect(() => {
    const down = (e) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      // Other shortcuts only when palette closed
      if (open) return;
      if (e.key === "n" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onNewWorkspace();
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [setOpen, onNewWorkspace, open]);

  const run = (fn) => {
    setOpen(false);
    setTimeout(() => fn?.(), 50);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <div data-testid="command-palette">
        <CommandInput
          placeholder="Type a command..."
          data-testid="command-input"
          className="font-mono-code"
        />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          <CommandGroup heading="Workspace">
            <CommandItem onSelect={() => run(onNewWorkspace)} data-testid="cmd-new-workspace">
              <Plus className="mr-2 h-4 w-4 text-[#007AFF]" />
              <span>New workspace</span>
              <CommandShortcut>⌘N</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => run(onClearLocal)} data-testid="cmd-clear-local">
              <Eraser className="mr-2 h-4 w-4 text-[#FFFF00]" />
              <span>Clear local state</span>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="AI Switches">
            <CommandItem onSelect={() => run(onToggleMode)} data-testid="cmd-toggle-mode">
              {currentMode === "pro" ? (
                <Zap className="mr-2 h-4 w-4 text-[#39FF14]" />
              ) : (
                <Cpu className="mr-2 h-4 w-4 text-[#FFFF00]" />
              )}
              <span>
                Switch to {currentMode === "pro" ? "Low Latency (Flash)" : "Thinking Mode (Pro)"}
              </span>
            </CommandItem>
            <CommandItem onSelect={() => run(onToggleGrounding)} data-testid="cmd-toggle-grounding">
              <Search className="mr-2 h-4 w-4 text-[#00FFFF]" />
              <span>
                {groundingEnabled ? "Disable" : "Enable"} Search Grounding
              </span>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="View">
            <CommandItem onSelect={() => run(() => onSwitchTab?.("preview"))} data-testid="cmd-view-preview">
              <Eye className="mr-2 h-4 w-4" />
              <span>Show Preview</span>
            </CommandItem>
            <CommandItem onSelect={() => run(() => onSwitchTab?.("code"))} data-testid="cmd-view-code">
              <Code className="mr-2 h-4 w-4" />
              <span>Show Code</span>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Navigation">
            <CommandItem onSelect={() => run(onOpenSettings)} data-testid="cmd-open-settings">
              <Settings2 className="mr-2 h-4 w-4 text-[#007AFF]" />
              <span>Provider Settings</span>
            </CommandItem>
            {isAdmin && (
              <CommandItem onSelect={() => run(onOpenAdmin)} data-testid="cmd-open-admin">
                <Shield className="mr-2 h-4 w-4 text-[#FFFF00]" />
                <span>Admin Panel</span>
              </CommandItem>
            )}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Account">
            <CommandItem onSelect={() => run(onLogout)} data-testid="cmd-logout">
              <LogOut className="mr-2 h-4 w-4 text-red-400" />
              <span>Log out</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </div>
    </CommandDialog>
  );
}
