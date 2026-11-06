#!/usr/bin/env python3
"""Check selected package documentation claims against the source inventory."""

from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
NUMBER_WORDS = {
    0: "zero",
    1: "one",
    2: "two",
    3: "three",
    4: "four",
    5: "five",
    6: "six",
    7: "seven",
    8: "eight",
    9: "nine",
    10: "ten",
}


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


agent_files = sorted(
    (ROOT / "packages/personal-agents/.apm/agents").glob("*.agent.md")
)
count = len(agent_files)
word = NUMBER_WORDS.get(count)
if word is None:
    fail(f"Update this check to support the current personal-agent count: {count}")


def read(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def stale_count_patterns(current_count: int) -> tuple[re.Pattern[str], ...]:
    patterns = []
    for number, word in NUMBER_WORDS.items():
        if number == current_count:
            continue
        patterns.extend(
            (
                re.compile(rf"\b{word} (?:Awesome Copilot )?agents\b", re.IGNORECASE),
                re.compile(rf"\bmatching {word} supplier dependencies\b", re.IGNORECASE),
                re.compile(
                    rf"\bthe {word} `github/awesome-copilot/agents/<filename>` dependencies\b",
                    re.IGNORECASE,
                ),
            )
        )
    return tuple(patterns)


count_claims = {
    "README.md": (f"[{word.title()} agents]",),
    "docs/package-catalog.md": (
        f"[{word} agents]",
        f"matching {word} supplier dependencies",
    ),
    "docs/consumption.md": (
        f"{word} Awesome Copilot agents",
        f"matching {word} supplier dependencies",
    ),
    "packages/personal-agents/README.md": (
        f"{word.title()} personal variants",
        f"the {word} `github/awesome-copilot/agents/<filename>` dependencies",
    ),
}
stale_count_claims = stale_count_patterns(count)
for relative_path, claims in count_claims.items():
    content = read(relative_path)
    for claim in claims:
        if claim not in content:
            fail(f"{relative_path} must reflect the {count}-agent inventory: {claim}")
    if any(pattern.search(content) for pattern in stale_count_claims):
        fail(f"{relative_path} contains a stale four-agent claim")

for relative_path in (
    "docs/consumption.md",
    "packages/personal-agents/README.md",
):
    if "`0.0.0` bootstrap version" in read(relative_path):
        fail(f"{relative_path} contains the stale bootstrap-version claim")

defaults_readme = read("packages/agent-defaults/README.md")
if "contains no personal identity" in defaults_readme.lower():
    fail("agent-defaults README denies public identity references in its content")

voice_patterns = read(
    "packages/agent-defaults/.apm/skills/writing-voice/references/voice-patterns.md"
)
public_handles = set(re.findall(r"(?<![\w])@[A-Za-z0-9-]+", voice_patterns))
if public_handles:
    if "public writing-voice reference" not in defaults_readme:
        fail("agent-defaults README must disclose its public writing-voice reference")
    for handle in public_handles:
        if f"`{handle}`" not in defaults_readme:
            fail(f"agent-defaults README must identify its public voice reference: {handle}")

print(f"OK: Selected documentation claims match {count} personal agents and package content.")
