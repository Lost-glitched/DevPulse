"""
DevPulse Culprit Detector — Deterministic blame analysis.

Correlates failure messages and stack traces with diff hunks between
passing and failing shadow commits to isolate the likely breaking change.
"""
from __future__ import annotations

import re
from typing import Any

# Match typical code identifiers (function names, variables, class names, file names)
_IDENT_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]{2,}")
_FILE_RE = re.compile(r"[\w\-\./]+\.[a-zA-Z0-9]+")

STOPWORDS = {
    "none", "true", "false", "self", "error", "exception", "traceback",
    "line", "file", "return", "import", "from", "def", "class", "async",
    "await", "const", "let", "var", "function", "null", "undefined",
}


def likely_culprit_hunks(
    diff: dict[str, Any],
    error_message: str = "",
    stack_trace: str = "",
) -> list[dict[str, Any]]:
    """
    Scan diff hunks for tokens present in error_message or stack_trace.
    Ranks hunks by matched identifier count. Deterministic and fast.
    """
    combined_err = f"{error_message}\n{stack_trace}".lower()
    if not combined_err.strip():
        return []

    error_tokens = set(t for t in _IDENT_RE.findall(combined_err) if t not in STOPWORDS)
    error_files = set(f.lower() for f in _FILE_RE.findall(combined_err))

    culprits: list[dict[str, Any]] = []

    files = diff.get("files", [])
    for f in files:
        file_path = f.get("file_path", "")
        file_name = file_path.split("/")[-1].lower()
        unified_diff = f.get("unified_diff", "")

        # Split into hunks by @@
        hunk_blocks = unified_diff.split("@@")
        # Git diff hunk: header @@ -a,b +c,d @@ hunk content
        for i in range(1, len(hunk_blocks), 2):
            header = hunk_blocks[i]
            body = hunk_blocks[i + 1] if i + 1 < len(hunk_blocks) else ""
            full_hunk = f"@@{header}@@{body}"

            # Only analyze added/modified lines in the hunk
            changed_lines = [
                line[1:] for line in body.splitlines()
                if line.startswith("+") and not line.startswith("+++")
            ]
            changed_text = " ".join(changed_lines).lower()

            hunk_tokens = set(t for t in _IDENT_RE.findall(changed_text) if t not in STOPWORDS)
            matched = sorted(list(hunk_tokens & error_tokens))

            # Bonus points if the file itself is mentioned in the stack trace
            score = len(matched)
            if file_name and (file_name in combined_err or any(file_name in ef for ef in error_files)):
                score += 5
                matched.append(f"file:{file_name}")

            if score > 0:
                culprits.append({
                    "file_path": file_path,
                    "hunk": full_hunk.strip(),
                    "score": score,
                    "matched_tokens": matched,
                })

    # Sort descending by score
    culprits.sort(key=lambda x: x["score"], reverse=True)
    return culprits
