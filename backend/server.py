from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Cookie
from fastapi.responses import StreamingResponse, JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import json
import uuid
import httpx
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, AsyncGenerator
from datetime import datetime, timezone, timedelta

from google import genai
from google.genai import types as genai_types


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
mongo_client = AsyncIOMotorClient(mongo_url)
db = mongo_client[os.environ['DB_NAME']]

# Google Gemini client
GOOGLE_API_KEY = os.environ.get('GOOGLE_API_KEY', '')
gemini_client = genai.Client(api_key=GOOGLE_API_KEY) if GOOGLE_API_KEY else None

GEMINI_PRO_MODEL = "gemini-3.1-pro-preview"
GEMINI_FLASH_MODEL = "gemini-3.1-flash-lite-preview"

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ============== MODELS ==============
class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Session(BaseModel):
    title: str = "New Workspace"


class Message(BaseModel):
    role: str  # "user" | "assistant"
    content: str
    citations: Optional[List[dict]] = None
    model: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ChatRequest(BaseModel):
    session_id: str
    prompt: str
    mode: str = "pro"  # "pro" | "flash"
    enable_grounding: bool = False
    history: List[dict] = Field(default_factory=list)
    provider_id: Optional[str] = None  # if set, use the user's saved OpenAI-compatible provider


class ProviderIn(BaseModel):
    name: str
    base_url: str
    api_key: str
    model: str
    is_active: bool = False


class ProviderPatch(BaseModel):
    name: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None
    is_active: Optional[bool] = None


# ============== AUTH HELPERS (DISABLED — single default user) ==============
DEFAULT_USER = {
    "user_id": "local-user",
    "email": "local@agentspace.dev",
    "name": "Local User",
    "picture": None,
}


async def _ensure_default_user():
    existing = await db.users.find_one({"user_id": DEFAULT_USER["user_id"]}, {"_id": 0})
    if not existing:
        await db.users.insert_one({
            **DEFAULT_USER,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })


async def get_current_user(request: Request) -> dict:
    # Auth disabled: always return the default local user
    await _ensure_default_user()
    return dict(DEFAULT_USER)


# ============== AUTH ROUTES (NO-OP — auth disabled) ==============
@api_router.get("/auth/me")
async def get_me(user=Depends(get_current_user)):
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user["name"],
        "picture": user.get("picture"),
    }


@api_router.post("/auth/logout")
async def logout(response: Response):
    return {"ok": True}


# ============== SESSION ROUTES ==============
@api_router.get("/sessions")
async def list_sessions(user=Depends(get_current_user)):
    items = await db.chat_sessions.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).sort("updated_at", -1).to_list(100)
    return items


@api_router.post("/sessions")
async def create_chat_session(body: Session, user=Depends(get_current_user)):
    session_id = f"sess_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "session_id": session_id,
        "user_id": user["user_id"],
        "title": body.title,
        "created_at": now,
        "updated_at": now,
    }
    await db.chat_sessions.insert_one(dict(doc))
    return doc


@api_router.delete("/sessions/{session_id}")
async def delete_chat_session(session_id: str, user=Depends(get_current_user)):
    await db.chat_sessions.delete_one(
        {"session_id": session_id, "user_id": user["user_id"]}
    )
    await db.chat_messages.delete_many({"session_id": session_id})
    return {"ok": True}


@api_router.patch("/sessions/{session_id}")
async def rename_session(session_id: str, body: dict, user=Depends(get_current_user)):
    await db.chat_sessions.update_one(
        {"session_id": session_id, "user_id": user["user_id"]},
        {"$set": {"title": body.get("title", "Untitled"), "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True}


@api_router.get("/sessions/{session_id}/messages")
async def get_messages(session_id: str, user=Depends(get_current_user)):
    sess = await db.chat_sessions.find_one(
        {"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    msgs = await db.chat_messages.find(
        {"session_id": session_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(1000)
    return msgs


# ============== ADMIN HELPER ==============
# Auth disabled — admin is always allowed in local mode
def is_admin(user: dict) -> bool:
    return True


async def require_admin(user=Depends(get_current_user)) -> dict:
    return user


# ============== PROVIDER ROUTES (OpenAI-compatible) ==============
def _sanitize_provider(p: dict, reveal: bool = False) -> dict:
    api_key = p.get("api_key", "") or ""
    masked = ("•" * max(0, len(api_key) - 4)) + api_key[-4:] if api_key else ""
    return {
        "provider_id": p.get("provider_id"),
        "name": p.get("name"),
        "base_url": p.get("base_url"),
        "model": p.get("model"),
        "is_active": bool(p.get("is_active")),
        "api_key_masked": masked,
        "api_key": api_key if reveal else None,
        "created_at": p.get("created_at"),
    }


@api_router.get("/providers")
async def list_providers(user=Depends(get_current_user)):
    items = await db.llm_providers.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    return [_sanitize_provider(p) for p in items]


@api_router.post("/providers")
async def create_provider(body: ProviderIn, user=Depends(get_current_user)):
    pid = f"prov_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "provider_id": pid,
        "user_id": user["user_id"],
        "name": body.name.strip(),
        "base_url": body.base_url.strip().rstrip("/"),
        "api_key": body.api_key.strip(),
        "model": body.model.strip(),
        "is_active": bool(body.is_active),
        "created_at": now,
    }
    if doc["is_active"]:
        await db.llm_providers.update_many(
            {"user_id": user["user_id"]}, {"$set": {"is_active": False}}
        )
    await db.llm_providers.insert_one(dict(doc))
    return _sanitize_provider(doc)


@api_router.patch("/providers/{provider_id}")
async def update_provider(provider_id: str, body: ProviderPatch, user=Depends(get_current_user)):
    existing = await db.llm_providers.find_one(
        {"provider_id": provider_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Provider not found")
    updates = {k: v for k, v in body.dict(exclude_unset=True).items() if v is not None}
    if "base_url" in updates:
        updates["base_url"] = updates["base_url"].rstrip("/")
    if updates.get("is_active"):
        await db.llm_providers.update_many(
            {"user_id": user["user_id"]}, {"$set": {"is_active": False}}
        )
    if updates:
        await db.llm_providers.update_one(
            {"provider_id": provider_id, "user_id": user["user_id"]},
            {"$set": updates},
        )
    refreshed = await db.llm_providers.find_one(
        {"provider_id": provider_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    return _sanitize_provider(refreshed)


@api_router.delete("/providers/{provider_id}")
async def delete_provider(provider_id: str, user=Depends(get_current_user)):
    await db.llm_providers.delete_one(
        {"provider_id": provider_id, "user_id": user["user_id"]}
    )
    return {"ok": True}


@api_router.post("/providers/{provider_id}/test")
async def test_provider(provider_id: str, user=Depends(get_current_user)):
    """Quick smoke-test: ping /models on the OpenAI-compatible endpoint."""
    p = await db.llm_providers.find_one(
        {"provider_id": provider_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not p:
        raise HTTPException(status_code=404, detail="Provider not found")
    url = p["base_url"].rstrip("/") + "/models"
    headers = {"Authorization": f"Bearer {p['api_key']}"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as cli:
            r = await cli.get(url, headers=headers)
            return {"ok": r.status_code < 400, "status": r.status_code, "body": (r.text or "")[:400]}
    except Exception as e:
        return {"ok": False, "status": 0, "body": str(e)[:400]}


async def get_active_provider(user_id: str) -> Optional[dict]:
    return await db.llm_providers.find_one(
        {"user_id": user_id, "is_active": True}, {"_id": 0}
    )


# ============== ADMIN ROUTES ==============
@api_router.get("/admin/me")
async def admin_me(user=Depends(get_current_user)):
    return {"is_admin": is_admin(user), "email": user["email"]}


@api_router.get("/admin/stats")
async def admin_stats(_admin=Depends(require_admin)):
    users = await db.users.count_documents({})
    sessions_count = await db.chat_sessions.count_documents({})
    messages_count = await db.chat_messages.count_documents({})
    providers_count = await db.llm_providers.count_documents({})
    recent_msgs = await db.chat_messages.find({}, {"_id": 0}).sort("created_at", -1).limit(10).to_list(10)
    return {
        "users": users,
        "sessions": sessions_count,
        "messages": messages_count,
        "providers": providers_count,
        "recent_messages": recent_msgs,
    }


@api_router.get("/admin/users")
async def admin_users(_admin=Depends(require_admin)):
    users = await db.users.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    # enrich with counts
    out = []
    for u in users:
        uid = u["user_id"]
        ws_count = await db.chat_sessions.count_documents({"user_id": uid})
        prov_count = await db.llm_providers.count_documents({"user_id": uid})
        msg_count = await db.chat_messages.count_documents({
            "session_id": {"$in": [
                s["session_id"] for s in
                await db.chat_sessions.find({"user_id": uid}, {"session_id": 1, "_id": 0}).to_list(1000)
            ]}
        })
        out.append({
            **u,
            "is_admin": is_admin(u),
            "workspaces": ws_count,
            "providers": prov_count,
            "messages": msg_count,
        })
    return out


@api_router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, admin=Depends(require_admin)):
    if user_id == admin["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    # gather user's session ids first
    sess_ids = [s["session_id"] async for s in
                db.chat_sessions.find({"user_id": user_id}, {"session_id": 1, "_id": 0})]
    await db.chat_messages.delete_many({"session_id": {"$in": sess_ids}})
    await db.chat_sessions.delete_many({"user_id": user_id})
    await db.llm_providers.delete_many({"user_id": user_id})
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.users.delete_one({"user_id": user_id})
    return {"ok": True}


# ============== OPENAI-COMPATIBLE STREAMING ==============
async def stream_openai(req: ChatRequest, user: dict, provider: dict) -> AsyncGenerator[str, None]:
    """Stream from any OpenAI-compatible /v1/chat/completions endpoint via SSE."""
    url = provider["base_url"].rstrip("/") + "/chat/completions"
    headers = {
        "Authorization": f"Bearer {provider['api_key']}",
        "Content-Type": "application/json",
    }
    msgs = [{"role": "system", "content": build_system_instruction()}]
    for m in req.history:
        if m.get("role") in ("user", "assistant"):
            msgs.append({"role": m["role"], "content": m.get("content", "")})
    msgs.append({"role": "user", "content": req.prompt})

    payload = {
        "model": provider["model"],
        "messages": msgs,
        "stream": True,
        "temperature": 0.7,
    }

    # Persist user message
    await db.chat_messages.insert_one({
        "session_id": req.session_id,
        "role": "user",
        "content": req.prompt,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    yield f"data: {json.dumps({'type': 'status', 'state': 'initializing', 'model': provider['model']})}\n\n"

    full_text = ""
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream("POST", url, json=payload, headers=headers) as r:
                if r.status_code >= 400:
                    body = await r.aread()
                    err = body.decode(errors="ignore")[:300]
                    yield f"data: {json.dumps({'type': 'error', 'message': f'Provider {r.status_code}: {err}'})}\n\n"
                    return

                first = True
                async for line in r.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        obj = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    choices = obj.get("choices") or []
                    if not choices:
                        continue
                    delta = (choices[0].get("delta") or {}).get("content") or ""
                    if first and delta:
                        yield f"data: {json.dumps({'type': 'status', 'state': 'generating'})}\n\n"
                        first = False
                    if delta:
                        full_text += delta
                        yield f"data: {json.dumps({'type': 'delta', 'text': delta})}\n\n"

        await db.chat_messages.insert_one({
            "session_id": req.session_id,
            "role": "assistant",
            "content": full_text,
            "citations": [],
            "model": provider["model"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await db.chat_sessions.update_one(
            {"session_id": req.session_id, "user_id": user["user_id"]},
            {"$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        yield f"data: {json.dumps({'type': 'done', 'citations': []})}\n\n"
    except Exception as e:
        logger.exception("OpenAI stream failed")
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)[:400]})}\n\n"


# ============== GEMINI STREAMING ==============
def build_system_instruction() -> str:
    return (
        "You are Agentspace, a Generative UI assistant. When the user asks you to build, design, "
        "or render any UI, you MUST respond with a single React component wrapped in a markdown "
        "code block tagged exactly as ```tsx artifact (or ```jsx artifact). The component MUST be "
        "named `App` and exported as the default. Do NOT include any import statements — the "
        "following are already in scope: React, useState, useMemo, useEffect, useCallback, motion, "
        "AnimatePresence, Button, Card, CardHeader, CardTitle, CardDescription, CardContent, "
        "CardFooter, Input, Badge, Tabs, TabsList, TabsTrigger, TabsContent, ScrollArea, Separator, "
        "Skeleton, Switch, Slider, and all lucide-react icons (e.g., Sparkles, Send, Code, Play, "
        "User, Bot, Search, Settings, etc.). Use Tailwind classes for styling. End with: "
        "`export default App;`. Keep the component self-contained and avoid external libraries. "
        "Before the code block, write a brief 1-2 sentence explanation. If the user asks a "
        "non-UI question, answer normally without generating code."
    )


async def stream_gemini(req: ChatRequest, user: dict) -> AsyncGenerator[str, None]:
    if gemini_client is None:
        yield f"data: {json.dumps({'type': 'error', 'message': 'Gemini not configured'})}\n\n"
        return

    model = GEMINI_PRO_MODEL if req.mode == "pro" else GEMINI_FLASH_MODEL

    # Build conversation
    contents = []
    for m in req.history:
        role = "user" if m.get("role") == "user" else "model"
        contents.append(genai_types.Content(role=role, parts=[genai_types.Part(text=m.get("content", ""))]))
    contents.append(genai_types.Content(role="user", parts=[genai_types.Part(text=req.prompt)]))

    # Build config
    cfg_kwargs = {
        "system_instruction": build_system_instruction(),
        "temperature": 0.7,
    }
    if req.enable_grounding:
        cfg_kwargs["tools"] = [genai_types.Tool(google_search=genai_types.GoogleSearch())]
    if req.mode == "pro":
        try:
            cfg_kwargs["thinking_config"] = genai_types.ThinkingConfig(thinking_level="high")
        except Exception:
            pass

    try:
        config = genai_types.GenerateContentConfig(**cfg_kwargs)
    except Exception as e:
        logger.warning(f"Falling back config: {e}")
        cfg_kwargs.pop("thinking_config", None)
        config = genai_types.GenerateContentConfig(**cfg_kwargs)

    # Persist user message
    user_msg = {
        "session_id": req.session_id,
        "role": "user",
        "content": req.prompt,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.chat_messages.insert_one(dict(user_msg))

    full_text = ""
    all_citations: List[dict] = []
    seen_uris = set()

    # Send initial status
    yield f"data: {json.dumps({'type': 'status', 'state': 'initializing', 'model': model})}\n\n"

    try:
        stream = gemini_client.models.generate_content_stream(
            model=model,
            contents=contents,
            config=config,
        )

        first_chunk = True
        emitted_generating = False
        for chunk in stream:
            if first_chunk:
                state = "thinking" if req.mode == "pro" else "generating"
                yield f"data: {json.dumps({'type': 'status', 'state': state})}\n\n"
                if req.mode != "pro":
                    emitted_generating = True
                first_chunk = False

            text_delta = ""
            try:
                if getattr(chunk, "text", None):
                    text_delta = chunk.text
            except Exception:
                pass

            if not text_delta:
                try:
                    for cand in (chunk.candidates or []):
                        content = getattr(cand, "content", None)
                        if content and getattr(content, "parts", None):
                            for part in content.parts:
                                pt = getattr(part, "text", None)
                                if pt:
                                    text_delta += pt
                except Exception:
                    pass

            if text_delta:
                full_text += text_delta
                if "```" in full_text and not emitted_generating:
                    emitted_generating = True
                    yield f"data: {json.dumps({'type': 'status', 'state': 'generating'})}\n\n"
                yield f"data: {json.dumps({'type': 'delta', 'text': text_delta})}\n\n"

            # Citations
            try:
                for cand in (chunk.candidates or []):
                    gm = getattr(cand, "grounding_metadata", None)
                    if gm:
                        chunks_arr = getattr(gm, "grounding_chunks", None) or []
                        for gc in chunks_arr:
                            web = getattr(gc, "web", None)
                            if web:
                                uri = getattr(web, "uri", None)
                                title = getattr(web, "title", None)
                                if uri and uri not in seen_uris:
                                    seen_uris.add(uri)
                                    cit = {"uri": uri, "title": title or uri}
                                    all_citations.append(cit)
                                    yield f"data: {json.dumps({'type': 'citation', 'citation': cit})}\n\n"
            except Exception:
                pass

        # Persist assistant message
        await db.chat_messages.insert_one({
            "session_id": req.session_id,
            "role": "assistant",
            "content": full_text,
            "citations": all_citations,
            "model": model,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        await db.chat_sessions.update_one(
            {"session_id": req.session_id, "user_id": user["user_id"]},
            {"$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
        )

        yield f"data: {json.dumps({'type': 'done', 'citations': all_citations})}\n\n"

    except Exception as e:
        logger.exception("Gemini stream failed")
        msg = str(e)
        if "RESOURCE_EXHAUSTED" in msg or "429" in msg:
            friendly = (
                "Gemini API quota exceeded for the current model. "
                "The provided Google API key is on the free tier with very limited quota. "
                "Please wait a minute and retry, or upgrade your Google AI plan."
            )
            yield f"data: {json.dumps({'type': 'error', 'message': friendly})}\n\n"
        else:
            yield f"data: {json.dumps({'type': 'error', 'message': msg[:400]})}\n\n"


@api_router.post("/chat/stream")
async def chat_stream(req: ChatRequest, user=Depends(get_current_user)):
    # Determine which generator to use based on user's active provider or explicit provider_id.
    provider = None
    if req.provider_id:
        provider = await db.llm_providers.find_one(
            {"provider_id": req.provider_id, "user_id": user["user_id"]}, {"_id": 0}
        )
    else:
        provider = await get_active_provider(user["user_id"])

    if provider:
        gen = stream_openai(req, user, provider)
    else:
        gen = stream_gemini(req, user)

    return StreamingResponse(
        gen,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ============== HEALTH ==============
@api_router.get("/")
async def root():
    return {"message": "Agentspace API", "model_pro": GEMINI_PRO_MODEL, "model_flash": GEMINI_FLASH_MODEL}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origin_regex=".*",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    mongo_client.close()
