from __future__ import annotations

import asyncio
import inspect
from typing import Any, AsyncIterator, Awaitable, Callable, Dict, Generator, List, Optional

from ._bridge import Bridge
from .types import KoderEvent, KoderSdkError, Permission, RunResult

PRESETS = ("deny", "acceptEdits", "auto")
_UNSET: Any = object()
_MODEL_KEYS = {"base_url": "baseUrl", "api_key": "apiKey", "key_env": "keyEnv", "context_window": "contextWindow", "max_output": "maxOutput", "chat_path": "chatPath", "send_api_key_header": "sendApiKeyHeader"}


def _check_permission(value: Permission) -> Permission:
    if value is None or callable(value) or value in PRESETS:
        return value
    raise KoderSdkError("BAD_PERMISSION", f"permission must be a callable or one of: {', '.join(PRESETS)}")


def _wire_permission(value: Permission) -> str:
    if value is None:
        return "deny"
    return "client" if callable(value) else str(value)


def _wire_model(model: Any) -> Any:
    if isinstance(model, dict):
        return {_MODEL_KEYS.get(key, key): value for key, value in model.items()}
    return str(model) if model is not None else None


async def _maybe_await(value: Any) -> Any:
    return await value if inspect.isawaitable(value) else value


def _wire_reply(reply: Any) -> Dict[str, Any]:
    if isinstance(reply, str):
        return {"text": reply, "toolCalls": []}
    reply = reply or {}
    calls = reply.get("toolCalls", reply.get("tool_calls")) or []
    return {
        "text": str(reply.get("text") or ""),
        "toolCalls": [{"id": str(call.get("id")), "name": call.get("name"), "arguments": call.get("arguments") or {}} for call in calls],
    }


class Run:
    """One agent turn. ``await run`` for the result, or ``async for event in run`` for live events."""

    def __init__(self, start: Callable[[Callable[[KoderEvent], None]], Awaitable[RunResult]], cancel: Callable[[], Awaitable[None]]) -> None:
        self._events: List[KoderEvent] = []
        self._changed = asyncio.Event()
        self._cancel = cancel
        self._task = asyncio.ensure_future(start(self._push))
        self._task.add_done_callback(self._finish)

    def _push(self, event: KoderEvent) -> None:
        self._events.append(event)
        self._wake()

    def _wake(self) -> None:
        changed, self._changed = self._changed, asyncio.Event()
        changed.set()

    def _finish(self, task: "asyncio.Task[RunResult]") -> None:
        if not task.cancelled():
            task.exception()  # mark as retrieved; callers that only iterate still see it
        self._wake()

    def __await__(self) -> Generator[Any, None, RunResult]:
        return asyncio.shield(self._task).__await__()

    async def result(self) -> RunResult:
        return await asyncio.shield(self._task)

    async def cancel(self) -> None:
        await self._cancel()

    def done(self) -> bool:
        return self._task.done()

    async def __aiter__(self) -> AsyncIterator[KoderEvent]:
        index = 0
        while True:
            while index < len(self._events):
                yield self._events[index]
                index += 1
            if self._task.done():
                if not self._task.cancelled() and self._task.exception():
                    raise self._task.exception()  # type: ignore[misc]
                return
            await self._changed.wait()


class Session:
    def __init__(self, koder: "Koder", info: Dict[str, Any], permission: Permission) -> None:
        self._koder = koder
        self._id = info["sessionId"]
        self.thread_id: str = info["threadId"]
        self.mode: str = info["mode"]
        self.read_only: bool = info["readOnly"]
        self._permission = permission
        self._active: Optional[Run] = None

    @property
    def busy(self) -> bool:
        return self._active is not None and not self._active.done()

    def send(self, prompt: str, *, mode: Optional[str] = None, read_only: Optional[bool] = None, permission: Permission = _UNSET, on_event: Optional[Callable[[KoderEvent], None]] = None) -> Run:
        if self._koder.closed:
            raise KoderSdkError("CLOSED", "this Koder instance is closed")
        if not isinstance(prompt, str) or not prompt.strip():
            raise KoderSdkError("BAD_PROMPT", "prompt must be a non-empty string")
        if self.busy:
            raise KoderSdkError("BUSY", "a turn is still running in this session; await it or call cancel() first")
        handler = self._permission if permission is _UNSET else _check_permission(permission)
        bridge = self._koder._bridge
        params: Dict[str, Any] = {"sessionId": self._id, "prompt": prompt, "permission": _wire_permission(handler)}
        if mode is not None:
            params["mode"] = mode
        if read_only is not None:
            params["readOnly"] = read_only

        async def start(push: Callable[[KoderEvent], None]) -> RunResult:
            events: List[KoderEvent] = []

            def deliver(event: KoderEvent) -> None:
                events.append(event)
                push(event)
                if on_event:
                    try:
                        on_event(event)
                    except Exception:
                        pass

            rid = bridge.next_id()
            if callable(handler):
                self._koder._handlers[rid] = handler
            try:
                result = await bridge.call("session.send", params, request_id=rid, on_event=deliver)
            except asyncio.CancelledError:
                await asyncio.gather(self.cancel(), return_exceptions=True)
                raise
            finally:
                self._koder._handlers.pop(rid, None)
            return RunResult.from_wire(result, events)

        self._active = Run(start, self.cancel)
        return self._active

    async def cancel(self) -> None:
        if not self._koder._bridge.closed:
            await self._koder._bridge.call("session.cancel", {"sessionId": self._id})

    async def reset(self) -> None:
        if self.busy:
            raise KoderSdkError("BUSY", "a turn is still running in this session")
        self.thread_id = (await self._koder._bridge.call("session.reset", {"sessionId": self._id}))["threadId"]

    async def messages(self) -> List[Dict[str, Any]]:
        return (await self._koder._bridge.call("session.messages", {"sessionId": self._id}))["messages"]


class Koder:
    """A Koder agent bound to one workspace. Create with ``await Koder.create(...)``."""

    def __init__(self) -> None:
        self._bridge: Bridge
        self._koder_id = ""
        self._permission: Permission = None
        self._provider: Any = None
        self._handlers: Dict[int, Callable[..., Any]] = {}
        self._closed = False
        self.workspace = ""
        self.model: Dict[str, Any] = {}
        self.tools: List[str] = []

    @classmethod
    async def create(
        cls,
        workspace: Optional[str] = None,
        *,
        model: Any = None,
        provider: Any = None,
        mode: Optional[str] = None,
        permission: Permission = None,
        lang: Optional[str] = None,
        env: Optional[Dict[str, str]] = None,
        context_ratio: Optional[float] = None,
        cli_root: Optional[str] = None,
        node: Optional[str] = None,
        server: Optional[str] = None,
    ) -> "Koder":
        self = cls()
        self._permission = _check_permission(permission)
        if provider is not None and not (callable(provider) or callable(getattr(provider, "complete", None))):
            raise KoderSdkError("BAD_PROVIDER", "provider must be callable or have a complete(messages, tools) method")
        self._provider = provider
        self._bridge = await Bridge.start(self._on_request, node=node, server=server)
        params: Dict[str, Any] = {"workspace": workspace, "model": _wire_model(model), "mode": mode, "lang": lang, "env": env, "contextRatio": context_ratio, "cliRoot": cli_root}
        params = {key: value for key, value in params.items() if value is not None}
        if permission is not None:
            params["permission"] = _wire_permission(permission)
        if provider is not None:
            params.update(provider="client", providerName=getattr(provider, "name", None) or "python", providerModel=getattr(provider, "model", None) or "python")
        try:
            info = await self._bridge.call("koder.create", params)
        except BaseException:
            await self._bridge.close()
            raise
        self._koder_id = info["koderId"]
        self.workspace = info["workspace"]
        self.model = info["model"]
        self.tools = info["tools"]
        return self

    @property
    def closed(self) -> bool:
        return self._closed or self._bridge.closed

    async def session(self, *, mode: Optional[str] = None, read_only: bool = False, permission: Permission = _UNSET) -> Session:
        if self.closed:
            raise KoderSdkError("CLOSED", "this Koder instance is closed")
        chosen = self._permission if permission is _UNSET else _check_permission(permission)
        params: Dict[str, Any] = {"koderId": self._koder_id, "readOnly": read_only, "permission": _wire_permission(chosen)}
        if mode is not None:
            params["mode"] = mode
        return Session(self, await self._bridge.call("session.create", params), chosen)

    async def _on_request(self, method: str, params: Dict[str, Any]) -> Any:
        if method == "permission.request":
            handler = self._handlers.get(params.get("runId"))
            if handler is None:
                raise KoderSdkError("NO_HANDLER", "no permission handler for this run")
            return await _maybe_await(handler(params["request"]))
        if method == "provider.complete":
            complete = self._provider if callable(self._provider) else self._provider.complete
            return _wire_reply(await _maybe_await(complete(params.get("messages") or [], params.get("tools") or [])))
        raise KoderSdkError("UNKNOWN_METHOD", f"unknown method {method}")

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        if not self._bridge.closed:
            try:
                await self._bridge.call("koder.close", {"koderId": self._koder_id})
            except KoderSdkError:
                pass
        await self._bridge.close()

    async def __aenter__(self) -> "Koder":
        return self

    async def __aexit__(self, *exc: Any) -> None:
        await self.close()


def query(prompt: str, workspace: Optional[str] = None, *, read_only: bool = False, on_event: Optional[Callable[[KoderEvent], None]] = None, **options: Any) -> Run:
    """Open, run one prompt, close. Must be called inside a running event loop."""
    holder: Dict[str, Any] = {}

    async def start(push: Callable[[KoderEvent], None]) -> RunResult:
        koder = await Koder.create(workspace, **options)
        try:
            session = await koder.session(read_only=read_only)
            if holder.get("cancelled"):
                result = RunResult(status="cancelled", reason="aborted", text="", exit_code=1, thread_id=session.thread_id, error=None, files=[], usage={"input": 0, "output": 0, "source": "none"})
                event = {"type": "result", "status": "cancelled", "exitCode": 1, "text": ""}
                result.events.append(event)
                push(event)
                return result
            run = session.send(prompt, on_event=on_event)
            holder["run"] = run
            async for event in run:
                push(event)
            return await run
        finally:
            await koder.close()

    async def cancel() -> None:
        holder["cancelled"] = True
        if "run" in holder:
            await holder["run"].cancel()

    return Run(start, cancel)


def query_sync(prompt: str, workspace: Optional[str] = None, **options: Any) -> RunResult:
    """Blocking helper for scripts without an event loop."""

    async def main() -> RunResult:
        return await query(prompt, workspace, **options)

    return asyncio.run(main())
