import asyncio
import json
import os
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from koder_sdk import Koder, KoderSdkError, query, query_sync  # noqa: E402


def tmp() -> str:
    return tempfile.mkdtemp(prefix="koder-sdk-py-")


def clean_env(**extra):
    env = {"PATH": os.environ.get("PATH", ""), "HOME": os.environ.get("HOME", ""), "KODER_CLI_HOME": tmp(), "KODER_LANG": "en"}
    env.update(extra)
    return env


class Scripted:
    """In-process model: each call returns the next step; callable steps receive the messages."""

    name = "scripted"
    model = "scripted"
    context_window = 64_000

    def __init__(self, steps):
        self.steps = steps
        self.calls = []

    async def complete(self, messages, tools):
        self.calls.append({"messages": messages, "tools": tools})
        step = self.steps[min(len(self.calls) - 1, len(self.steps) - 1)]
        return step(messages) if callable(step) else step


def text(value):
    return {"text": value, "tool_calls": []}


def tool(name, args, call_id="c1"):
    return {"text": "", "tool_calls": [{"id": call_id, "name": name, "arguments": args}]}


def tool_texts(messages):
    return [str(m.get("content")) for m in messages if m.get("role") == "tool"]


def base(provider, **extra):
    options = {"workspace": tmp(), "provider": provider, "env": clean_env()}
    options.update(extra)
    return options


class MockModel:
    """OpenAI-compatible endpoint on 127.0.0.1."""

    def __init__(self, steps, status=200):
        self.requests = []
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers.get("content-length", 0))) or b"{}")
                outer.requests.append({"headers": dict(self.headers), "body": body})
                if status != 200:
                    payload = json.dumps({"error": {"message": "nope"}}).encode()
                    self.send_response(status)
                else:
                    step = steps[min(len(outer.requests) - 1, len(steps) - 1)]
                    payload = json.dumps({"choices": [{"message": {"role": "assistant", "content": step["text"]}, "finish_reason": "stop"}], "usage": {"prompt_tokens": 12, "completion_tokens": 6}}).encode()
                    self.send_response(200)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}/v1"
        threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": 0.02}, daemon=True).start()

    def close(self):
        self.server.shutdown()
        self.server.server_close()


class QueryTests(unittest.IsolatedAsyncioTestCase):
    async def test_awaited_result(self):
        result = await query("hi", **base(Scripted([text("hello from koder")])))
        self.assertEqual(result.status, "completed")
        self.assertEqual(result.exit_code, 0)
        self.assertEqual(result.text, "hello from koder")
        self.assertEqual(result.files, [])
        self.assertEqual(result.events[-1]["type"], "result")

    async def test_iteration_streams_events_in_order(self):
        seen = [event["type"] async for event in query("hi", **base(Scripted([tool("list_dir", {"path": "."}), text("done")])))]
        self.assertEqual(seen, ["assistant", "tool_result", "assistant", "result"])

    async def test_edits_rejected_by_default(self):
        options = base(Scripted([tool("write_file", {"path": "a.txt", "content": "new\n"}), text("not written")]))
        result = await query("write", **options)
        self.assertFalse(Path(options["workspace"], "a.txt").exists())
        decision = next(e for e in result.events if e["type"] == "permission_decision")
        self.assertEqual((decision["kind"], decision["allow"]), ("edit", False))

    async def test_handler_sees_diff_and_allows(self):
        options = base(Scripted([tool("write_file", {"path": "out.txt", "content": "hello\n"}), text("written")]))
        requests = []

        def allow(request):
            requests.append(request)
            return True

        result = await query("write", permission=allow, **options)
        self.assertEqual(Path(options["workspace"], "out.txt").read_text(), "hello\n")
        self.assertEqual(result.files, ["out.txt"])
        self.assertEqual(requests[0]["kind"], "edit")
        self.assertIn("+hello", requests[0]["diff"])

    async def test_async_handler_and_accept_edits_preset(self):
        workspace = tmp()
        marker = Path(workspace, "ran.txt")
        provider = Scripted([tool("shell", {"command": f"printf ran > {json.dumps(str(marker))}"}), tool("write_file", {"path": "x.txt", "content": "x"}, "c2"), text("ok")])
        await query("go", workspace=workspace, provider=provider, env=clean_env(), permission="acceptEdits")
        self.assertFalse(marker.exists())
        self.assertEqual(Path(workspace, "x.txt").read_text(), "x")

        async def later(request):
            await asyncio.sleep(0.01)
            return request["kind"] == "command"

        provider = Scripted([tool("shell", {"command": "echo koder-py-ok"}), lambda m: text("saw" if any("koder-py-ok" in t for t in tool_texts(m)) else "no")])
        self.assertEqual((await query("run", permission=later, **base(provider))).text, "saw")

    async def test_raising_handler_cancels_without_writing(self):
        options = base(Scripted([tool("write_file", {"path": "boom.txt", "content": "x"}), text("never")]))

        def broken(request):
            raise RuntimeError("handler broke")

        result = await query("write", permission=broken, **options)
        self.assertEqual(result.status, "cancelled")
        self.assertFalse(Path(options["workspace"], "boom.txt").exists())
        self.assertTrue(any(e["type"] == "permission_error" and "handler broke" in e["message"] for e in result.events))

    async def test_question_answers(self):
        ask = tool("ask_user", {"question": "Which?", "options": ["A", "B"]})
        provider = Scripted([ask, lambda m: text(next((t for t in tool_texts(m) if "B" in t), "none"))])
        result = await query("pick", permission=lambda r: "B", **base(provider))
        self.assertIn("B", result.text)
        for answer in (True, 7, "C"):
            provider = Scripted([ask, text("answered?")])
            result = await query("pick", permission=lambda r, a=answer: a, **base(provider))
            self.assertEqual(result.status, "cancelled", answer)
            self.assertEqual(len(provider.calls), 1)
        provider = Scripted([ask, text("answered?")])
        self.assertEqual((await query("pick", permission="auto", **base(provider))).status, "cancelled")

    async def test_login_refused_without_handler(self):
        called = []
        result = await query("login", permission=lambda r: called.append(r) or True, **base(Scripted([tool("request_login", {"service": "mail"})])))
        self.assertEqual(called, [])
        self.assertEqual(result.reason, "login_refused")

    async def test_cancel_while_handler_pending(self):
        options = base(Scripted([tool("write_file", {"path": "late.txt", "content": "x"}), text("never")]))

        async def hang(request):
            await asyncio.Event().wait()

        run = query("write", permission=hang, **options)
        async for event in run:
            if event["type"] == "permission_request":
                await run.cancel()
        result = await run
        self.assertEqual(result.status, "cancelled")
        self.assertFalse(Path(options["workspace"], "late.txt").exists())


class SessionTests(unittest.IsolatedAsyncioTestCase):
    async def test_history_busy_reset_close(self):
        provider = Scripted([text("first"), lambda m: text("remembers" if len([x for x in m if x.get("role") == "user"]) == 2 else "forgot")])
        async with await Koder.create(**base(provider)) as koder:
            self.assertIn("read_file", koder.tools)
            session = await koder.session()
            first = session.send("one")
            with self.assertRaises(KoderSdkError) as caught:
                session.send("two")
            self.assertEqual(caught.exception.code, "BUSY")
            self.assertEqual((await first).text, "first")
            self.assertEqual((await session.send("two")).text, "remembers")
            self.assertEqual([m["content"] for m in await session.messages() if m["role"] == "user"], ["one", "two"])
            await session.reset()
            self.assertEqual(await session.messages(), [])
        with self.assertRaises(KoderSdkError) as caught:
            session.send("three")
        self.assertEqual(caught.exception.code, "CLOSED")

    async def test_read_only_hides_write_tools(self):
        provider = Scripted([text("ok")])
        async with await Koder.create(**base(provider)) as koder:
            await (await koder.session(read_only=True)).send("look")
            await (await koder.session()).send("work")
        names = lambda call: [t.get("name") or (t.get("function") or {}).get("name") for t in call["tools"]]  # noqa: E731
        self.assertNotIn("write_file", names(provider.calls[0]))
        self.assertIn("write_file", names(provider.calls[1]))


class ModelAndErrorTests(unittest.IsolatedAsyncioTestCase):
    async def test_http_model_and_snake_case_keys(self):
        server = MockModel([{"text": "over http"}])
        try:
            result = await query("hi", workspace=tmp(), env=clean_env(), model={"model": "m", "base_url": server.url, "api_key": "sk-test"})
            self.assertEqual(result.text, "over http")
            self.assertEqual(result.usage["input"], 12)
            headers = {key.lower(): value for key, value in server.requests[0]["headers"].items()}
            self.assertEqual(headers.get("authorization"), "Bearer sk-test")
        finally:
            server.close()

    async def test_http_401_is_unreachable(self):
        server = MockModel([], status=401)
        try:
            result = await query("hi", workspace=tmp(), env=clean_env(), model={"model": "m", "base_url": server.url, "api_key": "bad"})
            self.assertEqual(result.status, "unreachable")
            self.assertEqual(result.exit_code, 2)
            self.assertIn("HTTP 401", result.error["detail"])
        finally:
            server.close()

    async def test_configuration_errors(self):
        async def code(expected, **options):
            merged = {"workspace": tmp(), "env": clean_env()}
            merged.update(options)
            with self.assertRaises(KoderSdkError) as caught:
                await Koder.create(**merged)
            self.assertEqual(caught.exception.code, expected)

        await code("MODEL_MISSING")
        await code("BAD_WORKSPACE", workspace=str(Path(tmp(), "missing")), provider=Scripted([text("x")]))
        await code("BAD_MODE", mode="turbo", provider=Scripted([text("x")]))
        await code("BAD_PERMISSION", permission="yolo")
        await code("BAD_PROVIDER", provider=object())
        await code("SERVER_NOT_FOUND", server=str(Path(tmp(), "nope.mjs")))
        await code("NODE_NOT_FOUND", node=str(Path(tmp(), "no-node")), provider=Scripted([text("x")]))


class SyncTests(unittest.TestCase):
    def test_query_sync(self):
        result = query_sync("hi", **base(Scripted([text("sync ok")])))
        self.assertEqual(result.text, "sync ok")


if __name__ == "__main__":
    unittest.main()
