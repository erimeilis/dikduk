#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse


HOST = os.environ.get("DICTABERT_HOST", "127.0.0.1")
PORT = int(os.environ.get("DICTABERT_PORT", "8788"))
MODEL_NAME = os.environ.get("DICTABERT_MODEL", "dicta-il/dictabert-tiny-joint")
MODEL_REVISION = os.environ.get("DICTABERT_REVISION")
MAX_TEXT = int(os.environ.get("DICTABERT_MAX_TEXT", "2000"))


def json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(v) for v in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if hasattr(value, "item"):
        try:
            return json_safe(value.item())
        except Exception:
            pass
    return str(value)


def load_dictabert() -> tuple[Any, Any]:
    from transformers import AutoModel, AutoTokenizer

    kwargs: dict[str, Any] = {"trust_remote_code": True}
    if MODEL_REVISION:
        kwargs["revision"] = MODEL_REVISION

    print(f"[dictabert] loading {MODEL_NAME}", file=sys.stderr, flush=True)
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, **kwargs)
    model = AutoModel.from_pretrained(MODEL_NAME, **kwargs)
    model.eval()
    print(f"[dictabert] ready on http://{HOST}:{PORT}", file=sys.stderr, flush=True)
    return tokenizer, model


TOKENIZER, MODEL = load_dictabert()


class AnalyzerHandler(BaseHTTPRequestHandler):
    server_version = "PealimDictaBERT/0.1"

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path != "/health":
            self.write_json({"error": "Not found"}, status=404)
            return
        self.write_json({"ok": True, "model": MODEL_NAME})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path != "/analyze":
            self.write_json({"error": "Not found"}, status=404)
            return

        try:
            length = int(self.headers.get("content-length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception as exc:
            self.write_json({"error": f"Invalid JSON: {exc}"}, status=400)
            return

        text = payload.get("text") if isinstance(payload, dict) else None
        if not isinstance(text, str) or not text.strip():
            self.write_json({"error": "Missing text"}, status=400)
            return
        if len(text) > MAX_TEXT:
            self.write_json({"error": f"Text is too long; max {MAX_TEXT} characters"}, status=400)
            return

        output_style = payload.get("output_style", "json")
        if output_style not in {"json", "ud", "iahlt_ud"}:
            self.write_json({"error": "Unsupported output_style"}, status=400)
            return

        started = time.perf_counter()
        try:
            result = MODEL.predict([text], TOKENIZER, output_style=output_style)
        except Exception as exc:
            self.write_json({"error": f"DictaBERT failed: {exc}"}, status=500)
            return

        latency_ms = int((time.perf_counter() - started) * 1000)
        print(f"[dictabert] analyzed {len(text)} chars in {latency_ms}ms", file=sys.stderr, flush=True)
        self.write_json(json_safe(result), headers={"x-analyzer-latency-ms": str(latency_ms)})

    def send_cors_headers(self) -> None:
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-methods", "GET, POST, OPTIONS")
        self.send_header("access-control-allow-headers", "content-type, authorization")

    def write_json(
        self,
        body: Any,
        status: int = 200,
        headers: dict[str, str] | None = None,
    ) -> None:
        encoded = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_cors_headers()
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(encoded)))
        self.send_header("x-analyzer-model", MODEL_NAME)
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[http] {self.address_string()} {fmt % args}", file=sys.stderr, flush=True)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), AnalyzerHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
