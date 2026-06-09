# Agentspace — Product Requirements Document

## Problem Statement
Build a full-stack, offline-first React application called **Agentspace** — a futuristic, dark-themed Generative UI builder. The workspace consists of a left-hand chat interface and a right-hand live rendering dashboard for AI-generated React components (Artifacts), powered by Gemini 3.

## Stack & User Choices (confirmed)
- Frontend: **React (CRA + JSX)** + Tailwind + Framer Motion + react-live + cmdk + shadcn/ui
- Backend: **FastAPI** + Motor (async MongoDB) + Google GenAI SDK
- Auth: **Emergent Managed Google Auth** + MongoDB user persistence
- Models: **gemini-3.1-pro-preview** (Thinking Mode) + **gemini-3.1-flash-lite-preview** (Low Latency)
- Grounding: **Google Search tool** via google-genai
- Test User: `tester@agentspace.dev` (session token `test_session_agentspace_001`)

## User Personas
1. **Designer/PM** — explores quick UI prototypes by describing them in natural language
2. **Frontend Dev** — accelerates building React components by generating boilerplate
3. **AI tinkerer** — wants to experiment with Gemini 3 + grounding visually

## Core Requirements (static)
- Two-pane workspace: chat (left) + live preview (right)
- Streaming Gemini 3 chat with status states: Initializing / Thinking / Generating
- react-live preview that auto-extracts ` ```tsx artifact ` code blocks
- Scope exposes React hooks, framer-motion (motion, AnimatePresence), shadcn/ui (Button, Card, Input, Badge, Tabs, ScrollArea, Separator, Skeleton, Switch, Slider), full lucide-react icons
- Google Sign-in via Emergent OAuth, persistent sessions+messages in MongoDB
- Mode toggle (Thinking / Flash) + Search Grounding toggle with citation cards (cyber yellow)
- Command Palette (cmdk) via ⌘K with: new workspace (⌘N), clear local, toggle mode, toggle grounding, logout

## Implemented (2026-02-06)
- [x] Backend: FastAPI server with `/api/auth/*`, `/api/sessions/*`, `/api/chat/stream` (SSE)
- [x] Direct google-genai integration with Thinking config and GoogleSearch tool
- [x] Friendly RESOURCE_EXHAUSTED error message for free-tier quota limits
- [x] Frontend: Login screen (dark grid bg, Emergent OAuth redirect)
- [x] AuthCallback route handler for `#session_id=...` fragment
- [x] Two-pane Workspace with sessions sidebar, chat panel, artifact panel
- [x] Streaming chat with TypingIndicator (cyan/yellow/green glow per state)
- [x] react-live preview/code tabs with copy button
- [x] Artifact extraction regex (handles `tsx artifact`, `jsx artifact`, `tsx`, `jsx`)
- [x] Mode + Grounding toggles in header
- [x] cmdk command palette with ⌘K + ⌘N shortcuts
- [x] Citation cards rendered inline in assistant messages (Search Grounding)
- [x] Backend pytest suite (13/13 passing)

## Known Limitations
- User-provided Google API key is on the **free tier with very limited quota** — Pro Mode and Search Grounding frequently hit RESOURCE_EXHAUSTED. Backend converts to a friendly error event. Flash mode without grounding works reliably.

## Prioritized Backlog
**P1**
- Add fallback to Emergent Universal Key (Anthropic/OpenAI) when Google quota exhausted
- Image upload + multimodal Gemini calls
- Export artifact as a zipped Vite project

**P2**
- Per-workspace settings (system prompt override)
- Public artifact sharing via signed URL
- Inline edit + re-render of artifact code

**P3**
- Multi-user collaboration on a workspace
- Custom-trained adapters / RAG over user docs

## Next Action Items
1. Encourage the user to upgrade their Google AI plan (or supply a paid key) to fully exercise Pro Thinking + Grounding.
2. Consider adding Stripe-powered "Pro" tier on top of free workspace usage (revenue lever).
3. Add OG image preview + social shareability for individual artifacts (viral lever).
