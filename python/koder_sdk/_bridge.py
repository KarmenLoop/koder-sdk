"""Talks line-delimited JSON to `koder-sdk-server` (Node) over stdio."""

from __future__ import annotations

import asyncio
import json
import os
import shutil
from collections import deque
from pathlib import Path
from typing import Any, Awaitable, Callable, Deque, Dict, Optional

from .types import KoderSdkError

PROTOCOL_VERSION = 1
# Frames can carry whole files; asyncio's default 64 KiB line limit is too small.
LINE_LIMIT = 64 * 1024 * 1024
BUNDLED_SERVER = Path(__file__).resolve().parent / "_node" / "bin" / "koder-sdk-server.mjs"
DEFAULT_SERVER = BUNDLED_SERVER if BUNDLED_SERVER.is_file() else Path(__file__).resolve().parents[2] / "bin" / "koder-sdk-server.mjs"

RequestHandler = Callable[[str, Dict[str, Any]], Awaitable[Any]]


def find_node(node: Optional[str] = None) -> str:
    wanted = node or os.environ.get("KODER_NODE") or "node"
    found = shutil.which(wanted)
    if not found:
        raise KoderSdkError("NODE_NOT_FOUND", f"Node.js 22.13+ is required; {wanted!r} is not an executable. Install it or set KODER_NODE.")
    return found


def find_server(server: Optional[str] = None) -> str:
    path = Path(server or os.environ.get("KODER_SDK_SERVER") or DEFAULT_SERVER)
    if not path.is_file():
        raise KoderSdkError("SERVER_NOT_FOUND", f"koder-sdk-server not found at {path}. Set KODER_SDK_SERVER.")
    if not (path.parent.parent / "dist" / "server.mjs").is_file():
        raise KoderSdkError("SERVER_NOT_BUILT", f"{path.parent.parent / 'dist'} is missing. Run `npm run build` in koder-sdk.")
    return str(path)


class Bridge:
    def __init__(self, process: asyncio.subprocess.Process, on_request: RequestHandler) -> None:
        self._process = process
        self._on_request = on_request
        self._pending: Dict[int, "asyncio.Future[Dict[str, Any]]"] = {}
        self._listeners: Dict[int, Callable[[Dict[str, Any]], None]] = {}
        self._tasks: set = set()
        self._stderr: Deque[str] = deque(maxlen=40)
        self._next = 0
        self._closed = False
        self._reader: Optional[asyncio.Task] = None
        self._err_reader: Optional[asyncio.Task] = None
        self.info: Dict[str, Any] = {}

    @classmethod
    async def start(cls, on_request: RequestHandler, *, node: Optional[str] = None, server: Optional[str] = None) -> "Bridge":
        process = await asyncio.create_subprocess_exec(
            find_node(node),
            find_server(server),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            limit=LINE_LIMIT,
        )
        bridge = cls(process, on_request)
        bridge._reader = asyncio.ensure_future(bridge._read())
        bridge._err_reader = asyncio.ensure_future(bridge._read_stderr())
        try:
            bridge.info = await bridge.call("initialize")
        except BaseException:
            await bridge.close()
            raise
        if bridge.info.get("protocol") != PROTOCOL_VERSION:
            await bridge.close()
            raise KoderSdkError("PROTOCOL_MISMATCH", f"server speaks protocol {bridge.info.get('protocol')}, expected {PROTOCOL_VERSION}")
        return bridge

    @property
    def closed(self) -> bool:
        return self._closed

    def next_id(self) -> int:
        self._next += 1
        return self._next

    async def call(self, method: str, params: Optional[Dict[str, Any]] = None, *, request_id: Optional[int] = None, on_event: Optional[Callable[[Dict[str, Any]], None]] = None) -> Any:
        if self._closed:
            raise KoderSdkError("BRIDGE_CLOSED", "the Koder bridge process is not running" + self._stderr_tail())
        rid = request_id if request_id is not None else self.next_id()
        future: "asyncio.Future[Dict[str, Any]]" = asyncio.get_running_loop().create_future()
        self._pending[rid] = future
        if on_event:
            self._listeners[rid] = on_event
        try:
            await self._write({"id": rid, "method": method, "params": params or {}})
            frame = await future
        finally:
            self._pending.pop(rid, None)
            self._listeners.pop(rid, None)
        if "error" in frame:
            error = frame["error"] or {}
            raise KoderSdkError(error.get("code", "INTERNAL"), error.get("message", ""))
        return frame.get("result")

    async def _write(self, frame: Dict[str, Any]) -> None:
        stdin = self._process.stdin
        if stdin is None or stdin.is_closing():
            raise KoderSdkError("BRIDGE_CLOSED", "the Koder bridge process is not running" + self._stderr_tail())
        stdin.write((json.dumps(frame, ensure_ascii=False) + "\n").encode("utf-8"))
        await stdin.drain()

    async def _read(self) -> None:
        assert self._process.stdout is not None
        try:
            while True:
                line = await self._process.stdout.readline()
                if not line:
                    break
                try:
                    frame = json.loads(line)
                except ValueError:
                    self._stderr.append(f"[non-protocol stdout] {line[:200]!r}")
                    continue
                self._dispatch(frame)
        finally:
            self._fail_all()

    async def _read_stderr(self) -> None:
        assert self._process.stderr is not None
        while True:
            line = await self._process.stderr.readline()
            if not line:
                return
            self._stderr.append(line.decode("utf-8", "replace").rstrip())

    def _dispatch(self, frame: Dict[str, Any]) -> None:
        method = frame.get("method")
        if method == "run.event":
            params = frame.get("params") or {}
            listener = self._listeners.get(params.get("runId"))
            if listener:
                listener(params.get("event") or {})
            return
        if method:
            task = asyncio.ensure_future(self._answer(frame))
            self._tasks.add(task)
            task.add_done_callback(self._tasks.discard)
            return
        future = self._pending.get(frame.get("id"))
        if future and not future.done():
            future.set_result(frame)

    async def _answer(self, frame: Dict[str, Any]) -> None:
        try:
            result = await self._on_request(frame["method"], frame.get("params") or {})
            reply: Dict[str, Any] = {"id": frame["id"], "result": result}
        except Exception as error:  # the server treats any client error as a refusal
            reply = {"id": frame["id"], "error": {"code": getattr(error, "code", "CLIENT_ERROR"), "message": str(error)}}
        try:
            await self._write(reply)
        except KoderSdkError:
            pass

    def _fail_all(self) -> None:
        self._closed = True
        for future in self._pending.values():
            if not future.done():
                future.set_exception(KoderSdkError("BRIDGE_CLOSED", "the Koder bridge process exited" + self._stderr_tail()))
        self._pending.clear()

    def _stderr_tail(self) -> str:
        return ("\n" + "\n".join(self._stderr)) if self._stderr else ""

    async def close(self, timeout: float = 5.0) -> None:
        stdin = self._process.stdin
        if stdin is not None and not stdin.is_closing():
            stdin.close()
        try:
            await asyncio.wait_for(self._process.wait(), timeout)
        except asyncio.TimeoutError:
            self._process.kill()
            await self._process.wait()
        for task in (self._reader, self._err_reader):
            if task:
                await asyncio.gather(task, return_exceptions=True)
        # Handlers still waiting on the user can no longer be answered.
        for task in list(self._tasks):
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._closed = True
