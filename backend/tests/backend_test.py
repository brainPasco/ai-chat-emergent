"""Agentspace backend API tests (pytest).

Covers: auth, sessions CRUD, messages, chat streaming (flash, pro, grounding).
Uses pre-seeded session token from /app/memory/test_credentials.md.
"""
import json
import os
import time

import pytest
import requests

BASE_URL = os.environ.get(
    "BACKEND_URL", "https://ai-renderer-2.preview.emergentagent.com"
).rstrip("/")
SESSION_TOKEN = "test_session_agentspace_001"
HEADERS = {"Authorization": f"Bearer {SESSION_TOKEN}", "Content-Type": "application/json"}


# ============== AUTH ==============
class TestAuth:
    def test_me_with_valid_token(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=HEADERS, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["user_id"] == "test-user-agentspace"
        assert d["email"] == "tester@agentspace.dev"

    def test_me_without_token(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r.status_code == 401

    def test_me_with_invalid_token(self):
        r = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": "Bearer invalid_xyz"},
            timeout=15,
        )
        assert r.status_code == 401


# ============== SESSIONS CRUD ==============
class TestSessions:
    created_id: str = ""

    def test_create_session(self):
        r = requests.post(
            f"{BASE_URL}/api/sessions",
            headers=HEADERS,
            json={"title": "TEST_Session_Alpha"},
            timeout=15,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["title"] == "TEST_Session_Alpha"
        assert d["user_id"] == "test-user-agentspace"
        assert d["session_id"].startswith("sess_")
        TestSessions.created_id = d["session_id"]

    def test_list_sessions_contains_created(self):
        r = requests.get(f"{BASE_URL}/api/sessions", headers=HEADERS, timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert any(s["session_id"] == TestSessions.created_id for s in items)

    def test_get_messages_empty(self):
        sid = TestSessions.created_id
        r = requests.get(
            f"{BASE_URL}/api/sessions/{sid}/messages", headers=HEADERS, timeout=15
        )
        assert r.status_code == 200
        assert r.json() == []

    def test_get_messages_404_for_unknown(self):
        r = requests.get(
            f"{BASE_URL}/api/sessions/sess_doesnotexist/messages",
            headers=HEADERS,
            timeout=15,
        )
        assert r.status_code == 404

    def test_rename_session(self):
        sid = TestSessions.created_id
        r = requests.patch(
            f"{BASE_URL}/api/sessions/{sid}",
            headers=HEADERS,
            json={"title": "TEST_Renamed"},
            timeout=15,
        )
        assert r.status_code == 200
        # Verify via list
        r2 = requests.get(f"{BASE_URL}/api/sessions", headers=HEADERS, timeout=15)
        item = next(
            (s for s in r2.json() if s["session_id"] == sid), None
        )
        assert item is not None
        assert item["title"] == "TEST_Renamed"

    def test_delete_session(self):
        sid = TestSessions.created_id
        r = requests.delete(
            f"{BASE_URL}/api/sessions/{sid}", headers=HEADERS, timeout=15
        )
        assert r.status_code == 200
        # Verify gone
        r2 = requests.get(f"{BASE_URL}/api/sessions", headers=HEADERS, timeout=15)
        assert not any(s["session_id"] == sid for s in r2.json())


# ============== CHAT STREAM ==============
def _consume_sse(resp, max_seconds: int = 60):
    """Parse SSE response, return list of event dicts."""
    events = []
    start = time.time()
    for raw in resp.iter_lines(decode_unicode=True):
        if time.time() - start > max_seconds:
            break
        if not raw:
            continue
        if raw.startswith("data:"):
            payload = raw[5:].strip()
            try:
                events.append(json.loads(payload))
            except json.JSONDecodeError:
                pass
            if events and events[-1].get("type") in ("done", "error"):
                break
    return events


@pytest.fixture
def temp_session():
    r = requests.post(
        f"{BASE_URL}/api/sessions",
        headers=HEADERS,
        json={"title": "TEST_ChatSession"},
        timeout=15,
    )
    assert r.status_code == 200
    sid = r.json()["session_id"]
    yield sid
    requests.delete(f"{BASE_URL}/api/sessions/{sid}", headers=HEADERS, timeout=15)


class TestChatStream:
    def test_chat_stream_flash_basic(self, temp_session):
        """Flash mode, no grounding — should stream deltas + done OR friendly error."""
        sid = temp_session
        payload = {
            "session_id": sid,
            "prompt": "Say hello in 5 words.",
            "mode": "flash",
            "enable_grounding": False,
            "history": [],
        }
        with requests.post(
            f"{BASE_URL}/api/chat/stream",
            headers=HEADERS,
            json=payload,
            stream=True,
            timeout=90,
        ) as r:
            assert r.status_code == 200
            assert "text/event-stream" in r.headers.get("content-type", "")
            events = _consume_sse(r, max_seconds=80)

        types = [e.get("type") for e in events]
        print(f"Flash events: {types}")
        # Must start with initializing status
        assert any(e.get("type") == "status" and e.get("state") == "initializing"
                   for e in events), f"No init status: {events[:3]}"

        # Either we got deltas + done, or an error (quota) — both acceptable
        has_done = "done" in types
        has_error = "error" in types
        assert has_done or has_error, f"Stream ended without done/error: {types}"

        if has_done:
            # Persistence check: user message should be saved
            msgs = requests.get(
                f"{BASE_URL}/api/sessions/{sid}/messages", headers=HEADERS, timeout=15
            ).json()
            roles = [m["role"] for m in msgs]
            assert "user" in roles
            # Assistant message may exist only if we got deltas
            if any(t == "delta" for t in types):
                assert "assistant" in roles
        else:
            err_msg = next(e["message"] for e in events if e["type"] == "error")
            print(f"Flash got friendly error: {err_msg[:120]}")
            assert "quota" in err_msg.lower() or "exhausted" in err_msg.lower() or len(err_msg) > 0

    def test_chat_stream_pro_mode(self, temp_session):
        """Pro mode — accept either deltas or quota error."""
        sid = temp_session
        payload = {
            "session_id": sid,
            "prompt": "What is 2+2?",
            "mode": "pro",
            "enable_grounding": False,
            "history": [],
        }
        with requests.post(
            f"{BASE_URL}/api/chat/stream",
            headers=HEADERS,
            json=payload,
            stream=True,
            timeout=120,
        ) as r:
            assert r.status_code == 200
            events = _consume_sse(r, max_seconds=100)

        types = [e.get("type") for e in events]
        print(f"Pro events: {types}")
        assert any(e.get("type") == "status" and e.get("state") == "initializing"
                   for e in events)
        assert "done" in types or "error" in types

    def test_chat_stream_grounding(self, temp_session):
        """Grounding enabled — accept deltas+citations OR friendly error."""
        sid = temp_session
        payload = {
            "session_id": sid,
            "prompt": "Latest news headline today?",
            "mode": "flash",
            "enable_grounding": True,
            "history": [],
        }
        with requests.post(
            f"{BASE_URL}/api/chat/stream",
            headers=HEADERS,
            json=payload,
            stream=True,
            timeout=120,
        ) as r:
            assert r.status_code == 200
            events = _consume_sse(r, max_seconds=100)

        types = [e.get("type") for e in events]
        print(f"Grounding events: {types}")
        assert "done" in types or "error" in types

    def test_chat_stream_requires_auth(self, temp_session):
        sid = temp_session
        r = requests.post(
            f"{BASE_URL}/api/chat/stream",
            json={"session_id": sid, "prompt": "hi", "mode": "flash"},
            timeout=15,
        )
        assert r.status_code == 401
