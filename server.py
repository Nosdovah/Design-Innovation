#!/usr/bin/env python3
"""
HTTP server — serves static files AND handles the comments API via Turso (libSQL).

Setup:
    1. Copy .env.example to .env and fill in TURSO_URL and TURSO_TOKEN
    2. pip install libsql-client python-dotenv
    3. python server.py

Usage:
    python server.py
"""

import asyncio
import http.server
import json
import os
import urllib.parse
from datetime import datetime, timezone

import libsql_client
from dotenv import load_dotenv

# ─── Config ─────────────────────────────────────────────────────────────────
load_dotenv()

_RAW_URL    = os.environ.get("TURSO_URL", "")
TURSO_TOKEN = os.environ.get("TURSO_TOKEN", "")
PORT        = int(os.environ.get("PORT", 8000))

# libsql-client uses HTTP transport — convert libsql:// → https://
TURSO_URL = _RAW_URL.replace("libsql://", "https://") if _RAW_URL.startswith("libsql://") else _RAW_URL

if not TURSO_URL or not TURSO_TOKEN:
    raise SystemExit(
        "❌  Missing TURSO_URL or TURSO_TOKEN.\n"
        "    Copy .env.example → .env and fill in your Turso credentials."
    )


# ─── DB helpers (sync wrappers around async libsql) ─────────────────────────

def _run(coro):
    """Run an async coroutine from synchronous code."""
    return asyncio.run(coro)


async def _execute(sql: str, args: list = None):
    async with libsql_client.create_client(TURSO_URL, auth_token=TURSO_TOKEN) as client:
        return await client.execute(sql, args or [])


def db_init():
    """Create the comments table if it doesn't exist."""
    _run(_execute("""
        CREATE TABLE IF NOT EXISTS comments (
            id               TEXT PRIMARY KEY,
            card_id          TEXT NOT NULL,
            text             TEXT NOT NULL,
            ip               TEXT,
            hostname         TEXT,
            timestamp_display TEXT,
            created_at       TEXT NOT NULL
        )
    """))
    print("✅  Connected to Turso — table ready.")


def db_get_comments(card_id: str) -> list:
    result = _run(_execute(
        "SELECT id, card_id, text, ip, hostname, timestamp_display, created_at "
        "FROM comments WHERE card_id = ? ORDER BY created_at ASC",
        [card_id]
    ))
    rows = []
    for row in result.rows:
        rows.append({
            "id":                row[0],
            "card_id":           row[1],
            "text":              row[2],
            "ip":                row[3],
            "hostname":          row[4],
            "timestamp_display": row[5],
            "created_at":        row[6],
        })
    return rows


def db_insert_comment(comment: dict):
    _run(_execute(
        "INSERT INTO comments (id, card_id, text, ip, hostname, timestamp_display, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
            comment["id"],
            comment["card_id"],
            comment["text"],
            comment["ip"],
            comment["hostname"],
            comment["timestamp_display"],
            comment["created_at"],
        ]
    ))


def db_delete_comment(comment_id: str) -> bool:
    result = _run(_execute(
        "DELETE FROM comments WHERE id = ?",
        [comment_id]
    ))
    return result.rows_affected > 0


# ─── HTTP Handler ────────────────────────────────────────────────────────────

class CommentHandler(http.server.SimpleHTTPRequestHandler):

    def log_message(self, format, *args):
        pass  # Suppress default noise

    # ─── GET ────────────────────────────────────────────────────────────────
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/api/comments":
            params  = urllib.parse.parse_qs(parsed.query)
            card_id = params.get("card", [""])[0]
            try:
                comments = db_get_comments(card_id)
                self._json(200, comments)
            except Exception as e:
                print(f"[error] GET /api/comments: {e}")
                self._json(500, {"error": str(e)})
        else:
            super().do_GET()

    # ─── POST ───────────────────────────────────────────────────────────────
    def do_POST(self):
        if self.path != "/api/comments":
            self._json(404, {"error": "Not found"})
            return

        length = int(self.headers.get("Content-Length", 0))
        body   = self.rfile.read(length)
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            self._json(400, {"error": "Invalid JSON"})
            return

        card_id   = payload.get("card_id", "").strip()
        text      = payload.get("text", "").strip()
        hostname  = payload.get("hostname", "").strip()
        ts_display = payload.get("timestamp_display", "").strip()

        if not card_id or not text:
            self._json(400, {"error": "Missing card_id or text"})
            return

        ip = (
            self.headers.get("X-Forwarded-For", "").split(",")[0].strip()
            or self.client_address[0]
        )

        now = datetime.now(timezone.utc)
        comment = {
            "id":                now.isoformat(),
            "card_id":           card_id,
            "text":              text,
            "ip":                ip,
            "hostname":          hostname or ip,
            "timestamp_display": ts_display or now.strftime("%d %b %Y, %H:%M UTC"),
            "created_at":        now.isoformat(),
        }

        try:
            db_insert_comment(comment)
            print(f"[comment] card={card_id} ip={ip}")
            self._json(201, comment)
        except Exception as e:
            print(f"[error] POST /api/comments: {e}")
            self._json(500, {"error": str(e)})

    # ─── DELETE ─────────────────────────────────────────────────────────────
    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/api/comments":
            self._json(404, {"error": "Not found"})
            return

        params     = urllib.parse.parse_qs(parsed.query)
        comment_id = params.get("id", [""])[0]

        if not comment_id:
            self._json(400, {"error": "Missing id"})
            return

        try:
            deleted = db_delete_comment(comment_id)
            if deleted:
                print(f"[delete] id={comment_id}")
                self._json(200, {"success": True})
            else:
                self._json(404, {"error": "Comment not found"})
        except Exception as e:
            print(f"[error] DELETE /api/comments: {e}")
            self._json(500, {"error": str(e)})

    # ─── CORS + OPTIONS ─────────────────────────────────────────────────────
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)


# ─── Entry Point ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    # Initialise table on startup
    db_init()

    with http.server.ThreadingHTTPServer(("", PORT), CommentHandler) as httpd:
        print(f"🚀  Server running at http://localhost:{PORT}")
        print("    Press Ctrl+C to stop.\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
