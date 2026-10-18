from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, List, Literal, Optional, TypedDict, Union


class KoderSdkError(Exception):
    """Every SDK failure has a stable ``code``; the message is human text."""

    def __init__(self, code: str, message: str = "") -> None:
        super().__init__(message or code)
        self.code = code
        self.message = message or code

    def __repr__(self) -> str:
        return f"KoderSdkError(code={self.code!r}, message={self.message!r})"


Mode = Literal["standard", "code", "minimal", "plan", "execute", "report", "enhance"]
PermissionPreset = Literal["deny", "acceptEdits", "auto"]


class EditRequest(TypedDict):
    kind: Literal["edit"]
    id: str
    path: str
    before: str
    after: str
    diff: str


class CommandRequest(TypedDict):
    kind: Literal["command"]
    id: str
    command: str


class QuestionRequest(TypedDict):
    kind: Literal["question"]
    id: str
    question: str
    options: List[str]


PermissionRequest = Union[EditRequest, CommandRequest, QuestionRequest]
# True/False, {"allow": bool}, an option index or text, {"choice": ...}, "cancel" or {"cancel": True}.
PermissionAnswer = Union[bool, int, str, Dict[str, Any]]
PermissionHandler = Callable[[PermissionRequest], Union[PermissionAnswer, Awaitable[PermissionAnswer]]]
Permission = Union[PermissionPreset, PermissionHandler, None]

# Events are the same JSON objects as `koder --json` and the TypeScript SDK (camelCase keys).
KoderEvent = Dict[str, Any]


@dataclass
class RunResult:
    status: Literal["completed", "cancelled", "error", "unreachable"]
    reason: str
    text: str
    exit_code: int
    thread_id: str
    error: Optional[Dict[str, Any]]
    files: List[str]
    usage: Dict[str, Any]
    events: List[KoderEvent] = field(default_factory=list)

    @classmethod
    def from_wire(cls, value: Dict[str, Any], events: List[KoderEvent]) -> "RunResult":
        return cls(
            status=value.get("status", "error"),
            reason=value.get("reason", ""),
            text=value.get("text", ""),
            exit_code=int(value.get("exitCode", 1)),
            thread_id=value.get("threadId", ""),
            error=value.get("error"),
            files=list(value.get("files") or []),
            usage=dict(value.get("usage") or {}),
            events=events,
        )
