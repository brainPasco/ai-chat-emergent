import React from "react";
import { motion, AnimatePresence } from "framer-motion";

const STATES = {
  initializing: { label: "Initializing", color: "#00FFFF", glowClass: "glow-cyan" },
  thinking: { label: "Thinking", color: "#FFFF00", glowClass: "glow-yellow" },
  generating: { label: "Generating", color: "#39FF14", glowClass: "glow-green" },
};

export default function TypingIndicator({ state }) {
  const s = STATES[state] || STATES.initializing;
  return (
    <div className="flex items-center gap-2.5 px-3 py-2" data-testid={`typing-indicator-${state}`}>
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className={`h-1.5 w-1.5 rounded-full ${s.glowClass}`}
            style={{ background: s.color }}
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
          />
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.span
          key={state}
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 4 }}
          transition={{ duration: 0.2 }}
          className={`font-mono-code text-[12px] uppercase tracking-widest ${s.glowClass}`}
          style={{ color: s.color }}
        >
          {s.label}...
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
