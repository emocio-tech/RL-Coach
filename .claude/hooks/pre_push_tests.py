"""PreToolUse hook (Bash): run the project's pytest suite before `git push`.

Blocks the push and lists the failing tests when the suite is not green.
Lets the push through when all tests pass or when the project has no pytest setup.
"""
import json
import os
import re
import subprocess
import sys

PUSH_RE = re.compile(r"(^|[;&|(]\s*)git\b[^;&|]*?\bpush\b")
MARKERS = ("pytest.ini", "tox.ini", "setup.cfg", "pyproject.toml", "conftest.py", "tests")
TIMEOUT = 840


def deny(reason):
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": reason,
                }
            }
        )
    )


def find_python(cwd):
    for rel in (".venv/Scripts/python.exe", ".venv/bin/python"):
        path = os.path.join(cwd, rel)
        if os.path.exists(path):
            return path
    return sys.executable


def main():
    try:
        data = json.load(sys.stdin)
    except ValueError:
        return
    command = (data.get("tool_input") or {}).get("command") or ""
    if not PUSH_RE.search(command):
        return

    cwd = data.get("cwd") or os.getcwd()
    backend = os.path.join(cwd, "backend")
    if os.path.isdir(backend):
        cwd = backend  # tests live in backend/ (pytest.ini, .venv)
    if not any(os.path.exists(os.path.join(cwd, m)) for m in MARKERS):
        return  # no test setup detected: nothing to verify

    try:
        run = subprocess.run(
            [find_python(cwd), "-m", "pytest", "-q", "-rfE", "--tb=no", "-p", "no:cacheprovider"],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        deny(f"Push bloqué : la suite de tests dépasse {TIMEOUT}s.")
        return

    if run.returncode in (0, 5):  # 5 = no tests collected
        return

    output = (run.stdout or "") + (run.stderr or "")
    failed = [l.strip() for l in output.splitlines() if l.startswith(("FAILED", "ERROR"))]
    if failed:
        listing = "\n".join(f"  - {l}" for l in failed)
        reason = f"Push bloqué : {len(failed)} test(s) en échec.\n{listing}"
    elif "No module named pytest" in output:
        reason = "Push bloqué : pytest est introuvable dans l'environnement du projet."
    else:
        reason = "Push bloqué : pytest a échoué (code %d).\n%s" % (
            run.returncode,
            "\n".join(output.strip().splitlines()[-15:]),
        )
    deny(reason + "\nCorrige les tests puis relance le push.")


if __name__ == "__main__":
    main()
