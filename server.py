#!/usr/bin/env python3
"""
Custom HTTP server that serves static files AND handles the comments API.
Replaces: python -m http.server 8000
Usage:    python server.py
"""

import http.server
import json
import os
import urllib.parse
from datetime import datetime

COMMENTS_FILE = os.path.join(os.path.dirname(__file__), "comments.json")
PORT = 8000


def load_comments():
    try:
        with open(COMMENTS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_comments(data):
    with open(COMMENTS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


class CommentHandler(http.server.SimpleHTTPRequestHandler):

    def log_message(self, format, *args):
        # Suppress default logging noise; only print errors
        pass

    # ─── GET ────────────────────────────────────────────────────────────────
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/api/comments":
            params = urllib.parse.parse_qs(parsed.query)
            card_id = params.get("card", [""])[0]
            all_comments = load_comments()
            card_comments = all_comments.get(card_id, [])
            self._json_response(200, card_comments)
        else:
            # Serve static files normally
            super().do_GET()

    # ─── POST ───────────────────────────────────────────────────────────────
    def do_POST(self):
        if self.path == "/api/comments":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                payload = json.loads(body)
            except json.JSONDecodeError:
                self._json_response(400, {"error": "Invalid JSON"})
                return

            card_id = payload.get("card_id", "").strip()
            text = payload.get("text", "").strip()
            hostname = payload.get("hostname", "").strip()

            if not card_id or not text:
                self._json_response(400, {"error": "Missing card_id or text"})
                return

            # Capture real IP server-side
            ip = (
                self.headers.get("X-Forwarded-For", "").split(",")[0].strip()
                or self.client_address[0]
            )

            comment = {
                "id": datetime.utcnow().isoformat() + "Z",
                "text": text,
                "ip": ip,
                "hostname": hostname or ip,
                "timestamp": datetime.utcnow().strftime("%d %b %Y, %H:%M UTC"),
            }

            all_comments = load_comments()
            if card_id not in all_comments:
                all_comments[card_id] = []
            all_comments[card_id].append(comment)
            save_comments(all_comments)

            print(f"[comment] card={card_id} ip={ip} hostname={comment['hostname']}")
            self._json_response(201, comment)

        else:
            self._json_response(404, {"error": "Not found"})

    # ─── DELETE ─────────────────────────────────────────────────────────────
    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/comments":
            params = urllib.parse.parse_qs(parsed.query)
            card_id = params.get("card", [""])[0]
            comment_id = params.get("id", [""])[0]

            if not card_id or not comment_id:
                self._json_response(400, {"error": "Missing card or id"})
                return

            all_comments = load_comments()
            if card_id in all_comments:
                original_count = len(all_comments[card_id])
                all_comments[card_id] = [c for c in all_comments[card_id] if c.get("id") != comment_id]
                
                if len(all_comments[card_id]) < original_count:
                    save_comments(all_comments)
                    print(f"[delete] card={card_id} id={comment_id}")
                    self._json_response(200, {"success": True})
                    return
            
            self._json_response(404, {"error": "Comment not found"})
        else:
            self._json_response(404, {"error": "Not found"})

    # ─── CORS + HELPERS ─────────────────────────────────────────────────────
    def do_OPTIONS(self):
        self.send_response(204)
        self._add_cors()
        self.end_headers()

    def _add_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json_response(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._add_cors()
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    with http.server.ThreadingHTTPServer(("", PORT), CommentHandler) as httpd:
        print(f"✅  Server running at http://localhost:{PORT}")
        print(f"    Comments stored in: {COMMENTS_FILE}")
        print("    Press Ctrl+C to stop.\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
