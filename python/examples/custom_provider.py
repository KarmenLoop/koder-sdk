"""Runs offline: a tiny Python "model" writes a file, the permission handler approves it.

    python3 python/examples/custom_provider.py
"""

import asyncio
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from koder_sdk import Koder  # noqa: E402


class Demo:
    name = "demo"
    model = "demo"

    def __init__(self):
        self.step = 0

    async def complete(self, messages, tools):
        self.step += 1
        if self.step == 1:
            return {"text": "", "tool_calls": [{"id": "c1", "name": "write_file", "arguments": {"path": "hello.txt", "content": "hello from python\n"}}]}
        return {"text": "hello.txt is written.", "tool_calls": []}


async def main():
    workspace = tempfile.mkdtemp(prefix="koder-sdk-py-demo-")
    try:
        async with await Koder.create(workspace, provider=Demo(), permission=lambda r: r["kind"] == "edit") as koder:
            session = await koder.session()
            run = session.send("create hello.txt")
            async for event in run:
                print(event["type"])
            result = await run
        print(f"status={result.status} files={result.files}")
        print("hello.txt:", Path(workspace, "hello.txt").read_text().strip())
    finally:
        shutil.rmtree(workspace, ignore_errors=True)


asyncio.run(main())
