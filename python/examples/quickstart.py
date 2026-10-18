"""Real model: set KODER_MODEL, KODER_BASE_URL and KODER_API_KEY, or run `koder model add` first.

    python3 python/examples/quickstart.py /path/to/project "Explain what this project does"
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from koder_sdk import query  # noqa: E402


def ask(request):
    if request["kind"] == "edit":
        print(f"\n[edit] {request['path']}\n{request['diff']}")
        return False
    if request["kind"] == "command":
        print(f"\n[command] {request['command']}")
        return False
    return "cancel"


async def main():
    workspace = sys.argv[1] if len(sys.argv) > 1 else "."
    prompt = sys.argv[2] if len(sys.argv) > 2 else "Explain what this project does in three sentences."
    run = query(prompt, workspace, permission=ask)
    async for event in run:
        if event["type"] == "delta":
            print(event["text"], end="", flush=True)
    result = await run
    print(f"\n\nstatus={result.status} tokens={result.usage.get('input')}+{result.usage.get('output')}")
    if result.error:
        print(f"error={result.error}")
    return result.exit_code


sys.exit(asyncio.run(main()))
