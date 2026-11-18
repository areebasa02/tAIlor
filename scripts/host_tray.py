"""Lightweight Windows system-tray controller and log viewer for tAIlor AI Host.

Manages:
  1. Local GPU model server (colab_server.py on 127.0.0.1:8000)
  2. Node API proxy & queue server (server/server.mjs on 127.0.0.1:8787)
  3. Tailscale Funnel HTTPS tunnel (exposing port 8787 to the Render site)

Minimizing or closing the window hides it to the Windows system tray.
Choosing Quit stops all managed services and resets Tailscale Funnel.
"""

from __future__ import annotations

import json
import os
import queue
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import tkinter as tk
from tkinter import ttk

import pystray
from PIL import Image, ImageDraw

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ICON_PATH = PROJECT_ROOT / "scripts" / "tailor_host.ico"
SINGLE_INSTANCE_PORT = 48787
MAX_LOG_LINES = 3000

ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
PCT_RE = re.compile(r"(\d{1,3})%\|")
STEP_RE = re.compile(r"\b(\d+)\s*/\s*(\d+)\b")

CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)


def read_local_env() -> dict[str, str]:
    env = dict(os.environ)
    env_path = PROJECT_ROOT / ".env"
    if env_path.exists():
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            key, sep, val = line.partition("=")
            if sep and key.strip() and key.strip() not in env:
                env[key.strip()] = val.strip().strip("\"'")
    return env


def resolve_node_exe() -> str | None:
    found = shutil.which("node")
    if found:
        return found
    for candidate in (
        Path(r"C:\Program Files\nodejs\node.exe"),
        Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "nodejs" / "node.exe",
    ):
        if candidate.exists():
            return str(candidate)
    return None


def resolve_tailscale_exe() -> str | None:
    found = shutil.which("tailscale")
    if found:
        return found
    for candidate in (
        Path(r"C:\Program Files\Tailscale\tailscale.exe"),
        Path(r"C:\Program Files (x86)\Tailscale\tailscale.exe"),
    ):
        if candidate.exists():
            return str(candidate)
    return None


def resolve_venv_python() -> str:
    candidate = PROJECT_ROOT / ".venv" / "Scripts" / "python.exe"
    if candidate.exists():
        return str(candidate)
    return sys.executable


def is_port_listening(port: int, host: str = "127.0.0.1") -> bool:
    try:
        with socket.create_connection((host, port), timeout=0.5):
            return True
    except OSError:
        return False


def discover_tailscale_url(tailscale_exe: str | None) -> str:
    if not tailscale_exe:
        return ""
    try:
        proc = subprocess.run(
            [tailscale_exe, "status", "--json"],
            capture_output=True,
            text=True,
            timeout=4,
            creationflags=CREATE_NO_WINDOW,
        )
        if proc.returncode == 0 and proc.stdout.strip():
            data = json.loads(proc.stdout)
            dns_name = str(data.get("Self", {}).get("DNSName", "")).strip().rstrip(".")
            if dns_name:
                return f"https://{dns_name}"
    except Exception:
        pass
    return ""


def make_tray_icon_image(state: str) -> Image.Image:
    palette = {
        "online": ("#22C55E", "#69D5E6"),
        "loading": ("#F59E0B", "#FFCB44"),
        "error": ("#EF4444", "#EF4444"),
        "stopped": ("#64748B", "#475569"),
    }
    badge_hex, ring_hex = palette.get(state, palette["stopped"])
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([3, 3, 61, 61], radius=16, fill="#0D0F18", outline=ring_hex, width=4)
    draw.ellipse([13, 13, 51, 51], fill="#CE005A")
    draw.ellipse([23, 23, 41, 41], fill="#69D5E6")
    draw.ellipse([41, 41, 60, 60], fill=badge_hex, outline="#0D0F18", width=3)
    return img


def kill_process_tree(proc: subprocess.Popen[str] | None) -> None:
    if proc is None or proc.poll() is not None:
        return
    try:
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                capture_output=True,
                timeout=6,
                creationflags=CREATE_NO_WINDOW,
            )
        else:
            proc.terminate()
            proc.wait(timeout=4)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


@dataclass
class LogEntry:
    timestamp: str
    source: str  # HOST | GPU | API | TUNNEL
    level: str   # INFO | OK | WARN | ERROR | REQ
    text: str


class HostController:
    def __init__(self, log_queue: queue.Queue[LogEntry], on_state_change) -> None:
        self.log_queue = log_queue
        self.on_state_change = on_state_change
        self.lock = threading.RLock()

        self.env = read_local_env()
        self.api_port = int(self.env.get("PORT", "8787"))
        self.gpu_port = int(self.env.get("AI_SERVER_PORT", "8000"))
        self.node_exe = resolve_node_exe()
        self.tailscale_exe = resolve_tailscale_exe()
        self.python_exe = resolve_venv_python()

        self.funnel_url = (
            self.env.get("TAILSCALE_FUNNEL_URL", "").strip().rstrip("/")
            or discover_tailscale_url(self.tailscale_exe)
            or "https://phaethon.tail638fde.ts.net"
        )
        allowed = [
            o.strip()
            for o in self.env.get("ALLOWED_ORIGINS", "").split(",")
            if o.strip() and "onrender.com" in o.lower()
        ]
        self.render_url = allowed[0] if allowed else self.env.get("RENDER_SITE_URL", "").strip()

        self.gpu_proc: subprocess.Popen[str] | None = None
        self.api_proc: subprocess.Popen[str] | None = None
        self.tunnel_proc: subprocess.Popen[str] | None = None
        self.external_gpu = False
        self.external_api = False

        self.desired_running = False
        self.stopping = False
        self.overall_state = "stopped"
        self.state_detail = "Stopped"
        self.gpu_state = "Stopped"
        self.api_state = "Stopped"
        self.tunnel_state = "Stopped"
        self.models_summary = "Models unloaded"
        self.queue_summary = ""

        self._cr_throttle: dict[str, tuple[float, int]] = {}
        self._health_thread = threading.Thread(target=self._health_loop, daemon=True)
        self._health_thread.start()

    def emit(self, source: str, level: str, text: str) -> None:
        cleaned = text.strip()
        if not cleaned:
            return
        ts = datetime.now().strftime("%H:%M:%S")
        self.log_queue.put(LogEntry(ts, source, level, cleaned))

    def _classify_line(self, source: str, line: str) -> str:
        low = line.lower()
        if any(tok in low for tok in ("traceback", "error:", "exception", "failed", "fatal", "eaddrinuse", "oom")):
            if "0 failed" not in low:
                return "ERROR"
        if "warn" in low or "retry" in low or "timeout" in low or "not enabled" in low:
            return "WARN"
        if source == "API" and ("[api]" in low or "[stylist:" in low or "[try-on:" in low or "[wardrobe-scan:" in low):
            return "REQ"
        if source == "GPU" and ('"post /v1/' in low or '"get /v1/' in low):
            return "REQ"
        if any(tok in low for tok in ("ready", "listening on", "completed in", "funnel", "all configured qwen models are ready")):
            return "OK"
        return "INFO"

    def _pipe_reader(self, source: str, pipe) -> None:
        buf = ""
        is_cr = False
        try:
            while True:
                ch = pipe.read(1)
                if not ch:
                    if buf.strip():
                        self._handle_raw_line(source, buf, is_cr)
                    break
                if ch in ("\n", "\r"):
                    if buf.strip():
                        self._handle_raw_line(source, buf, ch == "\r" or is_cr)
                    buf = ""
                    is_cr = ch == "\r"
                else:
                    buf += ch
        except Exception:
            pass
        finally:
            try:
                pipe.close()
            except Exception:
                pass

    def _handle_raw_line(self, source: str, raw: str, from_cr: bool) -> None:
        line = ANSI_ESCAPE_RE.sub("", raw).strip()
        if not line:
            return
        # Skip noisy health-check access logs so the log stays practical and readable
        if 'GET /health HTTP' in line or 'GET /api/ai/health' in line:
            return

        if from_cr or "%|" in line:
            now = time.monotonic()
            pct_match = PCT_RE.search(line)
            pct = int(pct_match.group(1)) if pct_match else -1
            last_ts, last_pct = self._cr_throttle.get(source, (0.0, -1))
            if pct == 100 or (pct >= 0 and pct - last_pct >= 25) or (now - last_ts >= 3.0):
                self._cr_throttle[source] = (now, pct)
            else:
                return

        level = self._classify_line(source, line)
        self.emit(source, level, line)

    def _spawn_logged(
        self,
        source: str,
        cmd: list[str],
        extra_env: dict[str, str] | None = None,
    ) -> subprocess.Popen[str]:
        env = dict(self.env)
        if extra_env:
            env.update(extra_env)
        proc = subprocess.Popen(
            cmd,
            cwd=str(PROJECT_ROOT),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            creationflags=CREATE_NO_WINDOW,
        )
        assert proc.stdout is not None
        threading.Thread(target=self._pipe_reader, args=(source, proc.stdout), daemon=True).start()
        return proc

    def start(self) -> None:
        threading.Thread(target=self._start_worker, daemon=True).start()

    def _start_worker(self) -> None:
        with self.lock:
            if self.desired_running:
                return
            self.env = read_local_env()
            self.desired_running = True
            self.stopping = False
            self.overall_state = "loading"
            self.state_detail = "Starting services…"
            self.on_state_change()

        self.emit("HOST", "INFO", "Starting tAIlor AI Host stack…")

        # 1. GPU model server (port 8000)
        if is_port_listening(self.gpu_port):
            self.external_gpu = True
            self.gpu_state = "External"
            self.emit("GPU", "WARN", f"Port {self.gpu_port} is already listening; attaching to existing GPU server.")
        else:
            self.external_gpu = False
            self.gpu_state = "Starting"
            self.gpu_proc = self._spawn_logged(
                "GPU",
                [self.python_exe, "-u", "colab_server.py"],
                {"PYTHONUNBUFFERED": "1", "PYTHONIOENCODING": "utf-8", "HF_HUB_DISABLE_XET": "1"},
            )
            self.emit("GPU", "INFO", f"Launched colab_server.py on 127.0.0.1:{self.gpu_port}.")

        # 2. Node API proxy & queue server (port 8787)
        if not self.node_exe:
            self.api_state = "Missing Node"
            self.emit("API", "ERROR", "node.exe was not found on PATH or C:\\Program Files\\nodejs.")
        elif is_port_listening(self.api_port):
            self.external_api = True
            self.api_state = "External"
            self.emit("API", "WARN", f"Port {self.api_port} is already listening; attaching to existing Node API server.")
        else:
            self.external_api = False
            self.api_state = "Starting"
            self.api_proc = self._spawn_logged("API", [self.node_exe, "server/server.mjs"])
            self.emit("API", "INFO", f"Launched server/server.mjs on 127.0.0.1:{self.api_port}.")

        # 3. Tailscale Funnel
        if not self.tailscale_exe:
            self.tunnel_state = "Missing Tailscale"
            self.emit("TUNNEL", "ERROR", "tailscale.exe was not found. Install Tailscale to expose port 8787.")
        else:
            self.tunnel_state = "Starting"
            self.tunnel_proc = self._spawn_logged(
                "TUNNEL",
                [self.tailscale_exe, "funnel", "--yes", str(self.api_port)],
            )
            self.emit("TUNNEL", "INFO", f"Exposing port {self.api_port} via Tailscale Funnel -> {self.funnel_url}")

        self.on_state_change()

    def stop(self, on_done=None) -> None:
        threading.Thread(target=self._stop_worker, args=(on_done,), daemon=True).start()

    def _stop_worker(self, on_done=None) -> None:
        with self.lock:
            self.desired_running = False
            self.stopping = True
            self.state_detail = "Stopping services…"
            self.on_state_change()

        self.emit("HOST", "INFO", "Stopping tAIlor AI Host services…")

        if self.tunnel_proc is not None:
            kill_process_tree(self.tunnel_proc)
            self.tunnel_proc = None
        if self.tailscale_exe:
            try:
                subprocess.run(
                    [self.tailscale_exe, "funnel", "reset"],
                    capture_output=True,
                    timeout=5,
                    creationflags=CREATE_NO_WINDOW,
                )
                self.emit("TUNNEL", "INFO", "Tailscale Funnel closed (funnel reset).")
            except Exception as exc:
                self.emit("TUNNEL", "WARN", f"Could not reset Tailscale Funnel: {exc}")

        if self.api_proc is not None:
            kill_process_tree(self.api_proc)
            self.api_proc = None
            self.emit("API", "INFO", "Stopped Node API server.")

        if self.gpu_proc is not None:
            kill_process_tree(self.gpu_proc)
            self.gpu_proc = None
            self.emit("GPU", "INFO", "Stopped GPU model server.")

        with self.lock:
            self.stopping = False
            self.overall_state = "stopped"
            self.state_detail = "Stopped"
            self.gpu_state = "Stopped"
            self.api_state = "Stopped"
            self.tunnel_state = "Stopped"
            self.models_summary = "Models unloaded"
            self.queue_summary = ""
            self.on_state_change()

        if on_done:
            on_done()

    def restart(self) -> None:
        def _restart_seq():
            self._stop_worker()
            time.sleep(0.5)
            self._start_worker()

        threading.Thread(target=_restart_seq, daemon=True).start()

    def _health_loop(self) -> None:
        while True:
            time.sleep(2.0)
            if not self.desired_running or self.stopping:
                continue

            # Check unexpected process exits
            if self.gpu_proc and self.gpu_proc.poll() is not None and not self.external_gpu:
                code = self.gpu_proc.returncode
                self.gpu_proc = None
                self.gpu_state = f"Exited ({code})"
                self.emit("GPU", "ERROR", f"colab_server.py exited unexpectedly with code {code}.")

            if self.api_proc and self.api_proc.poll() is not None and not self.external_api:
                code = self.api_proc.returncode
                self.api_proc = None
                self.api_state = f"Exited ({code})"
                self.emit("API", "ERROR", f"server/server.mjs exited unexpectedly with code {code}.")

            if self.tunnel_proc and self.tunnel_proc.poll() is not None:
                code = self.tunnel_proc.returncode
                self.tunnel_proc = None
                self.tunnel_state = f"Exited ({code})"
                self.emit("TUNNEL", "ERROR", f"Tailscale Funnel exited with code {code}.")

            api_up = is_port_listening(self.api_port)
            tunnel_up = self.tunnel_proc is not None and self.tunnel_proc.poll() is None

            health_data = None
            if api_up:
                try:
                    with urllib.request.urlopen(f"http://127.0.0.1:{self.api_port}/api/ai/health", timeout=2.5) as resp:
                        health_data = json.loads(resp.read().decode("utf-8"))
                except urllib.error.HTTPError as err:
                    try:
                        health_data = json.loads(err.read().decode("utf-8"))
                    except Exception:
                        health_data = None
                except Exception:
                    health_data = None

            with self.lock:
                if not self.desired_running or self.stopping:
                    continue
                self.api_state = "Up" if api_up else "Down"
                self.tunnel_state = "Live" if tunnel_up else "Down"

                if not health_data:
                    self.gpu_state = "Starting…" if is_port_listening(self.gpu_port) else "Offline"
                    self.overall_state = "loading" if (api_up or is_port_listening(self.gpu_port)) else "error"
                    self.state_detail = "Waiting for GPU & API health…"
                else:
                    status = health_data.get("status")
                    backend = health_data.get("backend") or {}
                    loaded = backend.get("loaded") or {}
                    q = health_data.get("queue") or {}
                    running_tryon = q.get("tryOnRunning", 0)
                    queued_tryon = q.get("tryOnQueued", 0)
                    active_task = backend.get("active_task")

                    parts = []
                    parts.append(f"Text:{'OK' if loaded.get('text') else '...'}")
                    parts.append(f"Vision:{'OK' if loaded.get('vision') else '...'}")
                    parts.append(f"SDXL:{'Loaded' if loaded.get('tryon') else 'On-demand'}")
                    self.models_summary = " · ".join(parts)

                    if active_task or running_tryon or queued_tryon:
                        self.queue_summary = f"Active: {active_task or 'try-on'} · Queue: {queued_tryon}"
                    else:
                        self.queue_summary = "Idle"

                    if status == "ok":
                        self.gpu_state = "Ready"
                        if api_up and tunnel_up:
                            self.overall_state = "online"
                            self.state_detail = "Online — Teammates can test from Render"
                        else:
                            self.overall_state = "loading"
                            self.state_detail = "GPU Ready — Waiting on tunnel"
                    elif status == "loading":
                        self.gpu_state = "Loading"
                        self.overall_state = "loading"
                        self.state_detail = backend.get("loading_stage") or "Loading Qwen models…"
                    else:
                        self.gpu_state = "Offline"
                        self.overall_state = "error"
                        self.state_detail = health_data.get("error") or "GPU server unreachable"

            self.on_state_change()


class HostTrayApp:
    def __init__(self) -> None:
        self.root = tk.Tk()
        self.root.title("tAIlor AI Host")
        self.root.geometry("860x580")
        self.root.minsize(680, 440)
        self.root.configure(bg="#0D0F18")
        if ICON_PATH.exists():
            try:
                self.root.iconbitmap(str(ICON_PATH))
            except Exception:
                pass

        self.log_queue: queue.Queue[LogEntry] = queue.Queue()
        self.entries: list[LogEntry] = []
        self.filter_mode = tk.StringVar(value="all")
        self.auto_scroll = tk.BooleanVar(value=True)
        self.tray_hint_shown = False
        self.quitting = False

        self.controller = HostController(self.log_queue, self._schedule_status_refresh)
        self._build_ui()
        self._setup_tray()
        self._start_single_instance_listener()

        self.root.protocol("WM_DELETE_WINDOW", self.hide_to_tray)
        self.root.bind("<Unmap>", self._on_unmap)

        self.root.after(100, self._drain_logs)
        self.root.after(200, self.controller.start)

    def _build_ui(self) -> None:
        bg = "#0D0F18"
        card = "#151926"
        border = "#283046"
        fg = "#F8FAFC"
        muted = "#94A3B8"

        header = tk.Frame(self.root, bg=card, highlightbackground=border, highlightthickness=1, padx=14, pady=12)
        header.pack(fill="x", padx=12, pady=(12, 8))

        top_row = tk.Frame(header, bg=card)
        top_row.pack(fill="x")

        title_wrap = tk.Frame(top_row, bg=card)
        title_wrap.pack(side="left", fill="x", expand=True)

        self.status_badge = tk.Label(
            title_wrap,
            text="● STARTING",
            font=("Segoe UI", 11, "bold"),
            fg="#F59E0B",
            bg=card,
            anchor="w",
        )
        self.status_badge.pack(anchor="w")

        self.status_sub = tk.Label(
            title_wrap,
            text="Initializing local GPU, API server, and Tailscale Funnel…",
            font=("Segoe UI", 9),
            fg=muted,
            bg=card,
            anchor="w",
        )
        self.status_sub.pack(anchor="w", pady=(2, 0))

        pills = tk.Frame(top_row, bg=card)
        pills.pack(side="right")

        self.gpu_pill = self._make_pill(pills, "GPU :8000")
        self.api_pill = self._make_pill(pills, "API :8787")
        self.tunnel_pill = self._make_pill(pills, "Funnel")

        info_row = tk.Frame(header, bg=card)
        info_row.pack(fill="x", pady=(10, 0))

        self.url_label = tk.Label(
            info_row,
            text=f"Public Host URL: {self.controller.funnel_url}",
            font=("Consolas", 9, "bold"),
            fg="#69D5E6",
            bg=card,
        )
        self.url_label.pack(side="left")

        self.models_label = tk.Label(
            info_row,
            text="",
            font=("Segoe UI", 9),
            fg=muted,
            bg=card,
        )
        self.models_label.pack(side="right")

        # Controls toolbar
        toolbar = tk.Frame(self.root, bg=bg, padx=12)
        toolbar.pack(fill="x", pady=(0, 8))

        self.start_btn = self._make_button(toolbar, "Start", "#22C55E", "#0D0F18", self.controller.start)
        self.start_btn.pack(side="left", padx=(0, 6))

        self.restart_btn = self._make_button(toolbar, "Restart", "#69D5E6", "#0D0F18", self.controller.restart)
        self.restart_btn.pack(side="left", padx=(0, 6))

        self.stop_btn = self._make_button(toolbar, "Stop", "#EF4444", "#FFFFFF", self.controller.stop)
        self.stop_btn.pack(side="left", padx=(0, 12))

        self._make_button(toolbar, "Copy URL", "#1E2538", fg, self.copy_funnel_url).pack(side="left", padx=(0, 6))
        if self.controller.render_url:
            self._make_button(toolbar, "Open Render", "#CE005A", "#FFFFFF", self.open_render_site).pack(side="left", padx=(0, 6))

        self._make_button(toolbar, "Quit Server", "#1E2538", "#FCA5A5", self.quit_app).pack(side="right")
        self._make_button(toolbar, "Hide to Tray", "#1E2538", fg, self.hide_to_tray).pack(side="right", padx=(0, 6))

        # Log filter strip
        filter_bar = tk.Frame(self.root, bg=bg, padx=12)
        filter_bar.pack(fill="x", pady=(0, 6))

        tk.Label(filter_bar, text="Log View:", font=("Segoe UI", 9, "bold"), fg=muted, bg=bg).pack(side="left", padx=(0, 6))
        for val, label in (("all", "All"), ("requests", "Requests & Status"), ("errors", "Errors Only")):
            rb = tk.Radiobutton(
                filter_bar,
                text=label,
                value=val,
                variable=self.filter_mode,
                command=self._rerender_logs,
                font=("Segoe UI", 9),
                fg=fg,
                bg=bg,
                selectcolor="#1E2538",
                activebackground=bg,
                activeforeground="#69D5E6",
                indicatoron=False,
                padx=10,
                pady=3,
                bd=1,
                relief="solid",
            )
            rb.pack(side="left", padx=(0, 6))

        self._make_button(filter_bar, "Clear Log", "#1E2538", muted, self.clear_logs).pack(side="right")
        cb = tk.Checkbutton(
            filter_bar,
            text="Auto-scroll",
            variable=self.auto_scroll,
            font=("Segoe UI", 9),
            fg=muted,
            bg=bg,
            selectcolor="#1E2538",
            activebackground=bg,
            activeforeground=fg,
        )
        cb.pack(side="right", padx=(0, 10))

        # Log text pane
        log_frame = tk.Frame(self.root, bg="#080A10", highlightbackground=border, highlightthickness=1)
        log_frame.pack(fill="both", expand=True, padx=12, pady=(0, 12))

        scrollbar = ttk.Scrollbar(log_frame)
        scrollbar.pack(side="right", fill="y")

        self.log_text = tk.Text(
            log_frame,
            bg="#080A10",
            fg="#E2E8F0",
            insertbackground="#69D5E6",
            font=("Consolas", 10),
            wrap="word",
            state="disabled",
            bd=0,
            padx=10,
            pady=8,
            yscrollcommand=scrollbar.set,
        )
        self.log_text.pack(side="left", fill="both", expand=True)
        scrollbar.config(command=self.log_text.yview)

        self.log_text.tag_configure("TIME", foreground="#64748B")
        self.log_text.tag_configure("SRC_GPU", foreground="#A78BFA", font=("Consolas", 10, "bold"))
        self.log_text.tag_configure("SRC_API", foreground="#38BDF8", font=("Consolas", 10, "bold"))
        self.log_text.tag_configure("SRC_TUNNEL", foreground="#2DD4BF", font=("Consolas", 10, "bold"))
        self.log_text.tag_configure("SRC_HOST", foreground="#F472B6", font=("Consolas", 10, "bold"))
        self.log_text.tag_configure("LVL_INFO", foreground="#CBD5E1")
        self.log_text.tag_configure("LVL_OK", foreground="#4ADE80")
        self.log_text.tag_configure("LVL_WARN", foreground="#FBBF24")
        self.log_text.tag_configure("LVL_ERROR", foreground="#F87171")
        self.log_text.tag_configure("LVL_REQ", foreground="#7DD3FC")

    def _make_pill(self, parent: tk.Frame, text: str) -> tk.Label:
        lbl = tk.Label(
            parent,
            text=text,
            font=("Segoe UI", 8, "bold"),
            fg="#CBD5E1",
            bg="#1E2538",
            padx=9,
            pady=4,
            highlightbackground="#334155",
            highlightthickness=1,
        )
        lbl.pack(side="left", padx=(6, 0))
        return lbl

    def _make_button(self, parent: tk.Frame, text: str, bg: str, fg: str, cmd) -> tk.Button:
        return tk.Button(
            parent,
            text=text,
            command=cmd,
            bg=bg,
            fg=fg,
            activebackground=bg,
            activeforeground=fg,
            font=("Segoe UI", 9, "bold"),
            relief="flat",
            padx=11,
            pady=5,
            cursor="hand2",
        )

    def _setup_tray(self) -> None:
        menu = pystray.Menu(
            pystray.MenuItem("Open Control Panel", lambda _i, _m: self.root.after(0, self.show_window), default=True),
            pystray.MenuItem("Copy Funnel URL", lambda _i, _m: self.root.after(0, self.copy_funnel_url)),
            pystray.MenuItem(
                "Open Render Site",
                lambda _i, _m: self.root.after(0, self.open_render_site),
                enabled=bool(self.controller.render_url),
            ),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Start Host", lambda _i, _m: self.controller.start()),
            pystray.MenuItem("Restart All", lambda _i, _m: self.controller.restart()),
            pystray.MenuItem("Stop All", lambda _i, _m: self.controller.stop()),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Quit & Stop Server", lambda _i, _m: self.root.after(0, self.quit_app)),
        )
        self.tray_icon = pystray.Icon(
            "tailor_ai_host",
            make_tray_icon_image("loading"),
            "tAIlor AI Host (Starting)",
            menu,
        )
        self.tray_icon.run_detached()

    def _start_single_instance_listener(self) -> None:
        def _listen():
            srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                srv.bind(("127.0.0.1", SINGLE_INSTANCE_PORT))
                srv.listen(4)
            except OSError:
                return
            while not self.quitting:
                try:
                    conn, _ = srv.accept()
                    data = conn.recv(64)
                    conn.close()
                    if b"SHOW" in data:
                        self.root.after(0, self.show_window)
                except OSError:
                    break

        threading.Thread(target=_listen, daemon=True).start()

    def _on_unmap(self, _event) -> None:
        if not self.quitting and self.root.state() == "iconic":
            self.root.after(10, self.hide_to_tray)

    def hide_to_tray(self) -> None:
        if self.quitting:
            return
        self.root.withdraw()
        if not self.tray_hint_shown:
            self.tray_hint_shown = True
            try:
                self.tray_icon.notify("Minimized to system tray. AI server keeps running.", "tAIlor AI Host")
            except Exception:
                pass

    def show_window(self) -> None:
        self.root.deiconify()
        self.root.state("normal")
        self.root.lift()
        self.root.attributes("-topmost", True)
        self.root.after(120, lambda: self.root.attributes("-topmost", False))
        self.root.focus_force()

    def copy_funnel_url(self) -> None:
        self.root.clipboard_clear()
        self.root.clipboard_append(self.controller.funnel_url)
        self.controller.emit("HOST", "OK", f"Copied public URL to clipboard: {self.controller.funnel_url}")

    def open_render_site(self) -> None:
        if self.controller.render_url:
            webbrowser.open(self.controller.render_url)

    def clear_logs(self) -> None:
        self.entries.clear()
        self.log_text.configure(state="normal")
        self.log_text.delete("1.0", "end")
        self.log_text.configure(state="disabled")

    def _matches_filter(self, entry: LogEntry) -> bool:
        mode = self.filter_mode.get()
        if mode == "errors":
            return entry.level in ("ERROR", "WARN")
        if mode == "requests":
            return entry.level in ("REQ", "OK", "WARN", "ERROR") or entry.source in ("HOST", "TUNNEL")
        return True

    def _append_log_widget(self, entry: LogEntry) -> None:
        self.log_text.configure(state="normal")
        self.log_text.insert("end", f"[{entry.timestamp}] ", "TIME")
        self.log_text.insert("end", f"[{entry.source:<6}] ", f"SRC_{entry.source}")
        self.log_text.insert("end", f"{entry.text}\n", f"LVL_{entry.level}")
        line_count = int(self.log_text.index("end-1c").split(".")[0])
        if line_count > MAX_LOG_LINES:
            self.log_text.delete("1.0", f"{line_count - MAX_LOG_LINES}.0")
        self.log_text.configure(state="disabled")
        if self.auto_scroll.get():
            self.log_text.see("end")

    def _rerender_logs(self) -> None:
        self.log_text.configure(state="normal")
        self.log_text.delete("1.0", "end")
        for entry in self.entries:
            if self._matches_filter(entry):
                self.log_text.insert("end", f"[{entry.timestamp}] ", "TIME")
                self.log_text.insert("end", f"[{entry.source:<6}] ", f"SRC_{entry.source}")
                self.log_text.insert("end", f"{entry.text}\n", f"LVL_{entry.level}")
        self.log_text.configure(state="disabled")
        if self.auto_scroll.get():
            self.log_text.see("end")

    def _drain_logs(self) -> None:
        try:
            while True:
                entry = self.log_queue.get_nowait()
                self.entries.append(entry)
                if len(self.entries) > MAX_LOG_LINES:
                    self.entries = self.entries[-MAX_LOG_LINES:]
                if self._matches_filter(entry):
                    self._append_log_widget(entry)
        except queue.Empty:
            pass
        if not self.quitting:
            self.root.after(100, self._drain_logs)

    def _schedule_status_refresh(self) -> None:
        if not self.quitting:
            try:
                self.root.after(0, self._refresh_status_ui)
            except Exception:
                pass

    def _refresh_status_ui(self) -> None:
        c = self.controller
        colors = {
            "online": ("● ONLINE", "#22C55E"),
            "loading": ("◐ STARTING", "#F59E0B"),
            "error": ("⚠ ISSUE", "#EF4444"),
            "stopped": ("○ STOPPED", "#94A3B8"),
        }
        badge_text, badge_color = colors.get(c.overall_state, colors["stopped"])
        self.status_badge.configure(text=badge_text, fg=badge_color)
        self.status_sub.configure(text=c.state_detail)

        def _pill_style(lbl: tk.Label, title: str, val: str) -> None:
            ok = val in ("Ready", "Up", "Live", "External")
            warn = "Start" in val or "Load" in val
            fg = "#4ADE80" if ok else ("#FBBF24" if warn else ("#94A3B8" if val == "Stopped" else "#F87171"))
            lbl.configure(text=f"{title}: {val}", fg=fg)

        _pill_style(self.gpu_pill, "GPU :8000", c.gpu_state)
        _pill_style(self.api_pill, "API :8787", c.api_state)
        _pill_style(self.tunnel_pill, "Funnel", c.tunnel_state)

        summary = c.models_summary
        if c.queue_summary:
            summary = f"{summary}  |  {c.queue_summary}"
        self.models_label.configure(text=summary)

        running_or_starting = c.desired_running and not c.stopping
        self.start_btn.configure(state="disabled" if running_or_starting else "normal")
        self.stop_btn.configure(state="normal" if (running_or_starting or c.overall_state != "stopped") else "disabled")
        self.restart_btn.configure(state="normal" if not c.stopping else "disabled")

        try:
            self.tray_icon.icon = make_tray_icon_image(c.overall_state)
            self.tray_icon.title = f"tAIlor AI Host ({c.overall_state.upper()})"
        except Exception:
            pass

    def quit_app(self) -> None:
        if self.quitting:
            return
        self.quitting = True
        self.status_badge.configure(text="○ STOPPING", fg="#F59E0B")
        self.status_sub.configure(text="Shutting down GPU, API, and Tailscale Funnel…")

        def _finish():
            try:
                self.tray_icon.stop()
            except Exception:
                pass
            self.root.after(0, self.root.destroy)

        self.controller.stop(on_done=_finish)

    def run(self) -> None:
        self.root.mainloop()


def signal_existing_instance() -> bool:
    try:
        with socket.create_connection(("127.0.0.1", SINGLE_INSTANCE_PORT), timeout=0.5) as sock:
            sock.sendall(b"SHOW\n")
            return True
    except OSError:
        return False


if __name__ == "__main__":
    if signal_existing_instance():
        sys.exit(0)
    HostTrayApp().run()
