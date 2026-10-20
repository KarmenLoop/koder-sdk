"""Require the generated Node bridge before producing a Python distribution."""
from pathlib import Path
from setuptools import setup
from setuptools.command.build_py import build_py


class BuildWithBridge(build_py):
    def run(self):
        bridge = Path(__file__).resolve().parent / "koder_sdk" / "_node"
        if not (bridge / "dist" / "server.mjs").is_file():
            raise RuntimeError("The Node bridge is missing. Run `npm run build` in the koder-sdk repository before building the Python package.")
        super().run()


setup(cmdclass={"build_py": BuildWithBridge})
