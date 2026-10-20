"""Exercise an extracted Python wheel from outside the source checkout."""
import argparse
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile

EXERCISE = r'''
import asyncio
from pathlib import Path
from koder_sdk import Koder

class Provider:
    name = model = "wheel-fixture"
    context_window = 64000

    def __init__(self):
        self.calls = 0

    async def complete(self, messages, tools):
        self.calls += 1
        if self.calls == 1:
            return {"text": "", "tool_calls": [{"id": "write-fixture", "name": "write_file", "arguments": {"path": "result.txt", "content": "wheel works\n"}}]}
        users = [m for m in messages if m["role"] == "user"]
        return {"text": "remembers" if len(users) == 2 else "written", "tool_calls": []}

async def main():
    provider = Provider()
    async with await Koder.create(workspace=str(Path.cwd()), provider=provider, permission="acceptEdits") as koder:
        session = await koder.session()
        result = await session.send("Write the fixture file")
        assert result.status == "completed", result
        assert Path("result.txt").read_text() == "wheel works\n"
        result = await session.send("Recall the first request")
        assert result.text == "remembers", result
    print("PASS: installed wheel starts its bundled Node bridge, writes the approved file, and retains the previous turn")

asyncio.run(main())
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('wheel', type=Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='koder-sdk-wheel-') as folder:
        root = Path(folder)
        site = root / 'site'
        with zipfile.ZipFile(args.wheel) as archive:
            archive.extractall(site)
        script = root / 'exercise.py'
        script.write_text(EXERCISE, encoding='utf-8')
        env = dict(os.environ, PYTHONPATH=str(site), KODER_CLI_HOME=str(root / 'config'))
        env.pop('KODER_SDK_SERVER', None)
        return subprocess.run([sys.executable, '-B', str(script)], cwd=root, env=env, timeout=30).returncode


if __name__ == '__main__':
    sys.exit(main())
