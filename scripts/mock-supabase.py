#!/usr/bin/env python3
"""Мок Supabase REST для локальной проверки синхронизации.

Поддерживает только то, что использует store.js:
  GET    /rest/v1/days?select=date,payload&space=eq.<space>&order=...&limit=...&date=eq.<date>
  POST   /rest/v1/days?on_conflict=date   (upsert)
  DELETE /rest/v1/days?date=eq.<date>&space=eq.<space>
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

ROWS = {}  # (space, date) -> row


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("MOCK %s\n" % (fmt % args))
        sys.stderr.flush()

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "apikey,authorization,content-type,prefer,x-client-info")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")
        self.send_header("Access-Control-Expose-Headers", "content-range")
        self.send_header("Content-Type", "application/json")

    def _body(self):
        length = int(self.headers.get("content-length") or 0)
        return self.rfile.read(length) if length else b""

    def _send(self, code, payload):
        data = json.dumps(payload).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/rest/v1/days"):
            return self._send(404, {"error": "not found"})
        q = parse_qs(parsed.query)
        space = (q.get("space") or ["eq.personal"])[0].replace("eq.", "")
        rows = [r for (s, _d), r in ROWS.items() if s == space]
        if "date" in q:
            want = q["date"][0].replace("eq.", "")
            rows = [r for r in rows if r["date"] == want]
        rows.sort(key=lambda r: r["date"], reverse=True)
        limit = int((q.get("limit") or ["400"])[0])
        print("GET days space=%s -> %d" % (space, len(rows[:limit])), flush=True)
        return self._send(200, rows[:limit])

    def do_POST(self):
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/rest/v1/days"):
            return self._send(404, {"error": "not found"})
        try:
            items = json.loads(self._body() or b"[]")
        except Exception as exc:  # noqa: BLE001
            return self._send(400, {"error": str(exc)})
        for item in items:
            space = item.get("space") or "personal"
            date = item.get("date")
            ROWS[(space, date)] = {
                "date": date,
                "payload": item.get("payload"),
                "space": space,
                "updated_at": item.get("updated_at"),
            }
            print("POST days %s (%d tasks)" % (date, len((item.get("payload") or {}).get("tasks") or [])), flush=True)
        return self._send(201, [])

    def do_DELETE(self):
        parsed = urlparse(self.path)
        q = parse_qs(parsed.query)
        date = (q.get("date") or [""])[0].replace("eq.", "")
        space = (q.get("space") or ["eq.personal"])[0].replace("eq.", "")
        ROWS.pop((space, date), None)
        print("DELETE days %s" % date, flush=True)
        return self._send(204, [])


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8788
    print("mock supabase on %d" % port, flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
