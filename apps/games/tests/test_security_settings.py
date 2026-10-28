"""Settings that must be safe by default (audit B items done in D).

Settings are read once per process from the environment, so each case runs Django in a child
process with exactly the variables it needs (nothing inherited from this test run).
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
STRONG_SECRET = "x" * 50


def run(args: list[str], **env: str) -> subprocess.CompletedProcess:
    clean = {"PATH": os.environ["PATH"], "HOME": os.environ.get("HOME", "/tmp"), **env}
    return subprocess.run(
        [sys.executable, *args], cwd=ROOT, env=clean, capture_output=True, text=True, timeout=60
    )


def settings_value(name: str, **env: str) -> str:
    code = f"import config.settings as s; print(s.{name})"
    result = run(["-c", code], **env)
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


class TestDebugIsOffUnlessAskedFor:
    def test_a_server_with_its_secret_but_no_debug_variable_runs_without_debug(self):
        assert settings_value("DEBUG", DJANGO_SECRET_KEY=STRONG_SECRET) == "False"

    def test_debug_still_turns_on_from_the_environment(self):
        assert settings_value("DEBUG", DJANGO_DEBUG="true") == "True"

    def test_a_server_with_nothing_configured_refuses_to_start(self):
        result = run(["-c", "import config.settings"])
        assert result.returncode != 0
        assert "DJANGO_DEBUG=true" in result.stderr  # tells a developer what to do

    @pytest.mark.parametrize(
        ("env", "expected"),
        [({}, "True"), ({"DJANGO_SECRET_KEY": STRONG_SECRET}, "False")],
    )
    def test_manage_py_is_development_only_without_a_secret(self, env, expected):
        code = "from django.conf import settings; print(settings.DEBUG)"
        result = run(["manage.py", "shell", "-v", "0", "-c", code], **env)
        assert result.returncode == 0, result.stderr
        assert result.stdout.strip().splitlines()[-1] == expected
