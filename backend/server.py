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


# ============== AUTH HELPERS ==============
async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=401, detail="Invalid session")

    expires_at = sess["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")

    user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ============== AUTH ROUTES ==============
@api_router.post("/auth/session")
async def create_session(request: Request, response: Response):
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")

    # Exchange session_id with Emergent
    async with httpx.AsyncClient() as client:
        r = await client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id},
            timeout=10.0,
        )
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session_id")
        data = r.json()

    email = data["email"]
    name = data.get("name", email)
    picture = data.get("picture")
    session_token = data["session_token"]

    # Upsert user
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    # Store session
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {"$set": {
            "user_id": user_id,
            "session_token": session_token,
            "expires_at": expires_at.isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )

    response.set_cookie(
        "session_token",
        session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60,
    )

    return {
        "user_id": user_id,
        "email": email,
        "name": name,
        "picture": picture,
    }


@api_router.get("/auth/me")
async def get_me(user=Depends(get_current_user)):
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user["name"],
        "picture": user.get("picture"),
    }


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/", samesite="none", secure=True)
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
        for chunk in stream:
            if first_chunk:
                state = "thinking" if req.mode == "pro" else "generating"
                yield f"data: {json.dumps({'type': 'status', 'state': state})}\n\n"
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
                if "```" in full_text and not getattr(stream_gemini, "_emitted_gen", False):
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
    return StreamingResponse(
        stream_gemini(req, user),
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
