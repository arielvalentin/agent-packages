#!/usr/bin/env bash
set -euo pipefail

python3 <<'PY'
from pathlib import Path
import json
import hashlib
import yaml

expected = {
    "acting-on-behalf", "adversarial-review", "consensus-panel",
    "handoff-envelope", "human-interaction-safeguard", "pr-feedback-review",
    "pr-lifecycle", "pr-review-protocol", "resolve-github-user",
    "review-fix-loop", "stage-pr", "tech-research", "writing-voice",
}
defaults = Path("packages/agent-defaults")
legacy = Path("packages/coordinator")
skills = defaults / ".apm/skills"
actual = {p.parent.name for p in skills.glob("*/SKILL.md")}
assert actual == expected, f"{defaults}: missing or unexpected canonical skills"
for name in actual:
    text = (skills / name / "SKILL.md").read_text()
    metadata = yaml.safe_load(text.split("---", 2)[1])
    assert metadata["name"] == name, f"{defaults}: skill identity changed: {name}"
    assert isinstance(metadata.get("description"), str) and metadata["description"].strip(), \
        f"{defaults}: missing skill description: {name}"

snapshots = {}
snapshot_manifest = (legacy / "skill-snapshots.sha256").read_bytes()
assert hashlib.sha256(snapshot_manifest).hexdigest() == \
    "f7fddfcf6a6d2d60fb7e6dff9b51fe51f3d600e8be2555fbba59dd0519515c18", \
    "frozen coordinator snapshot manifest changed"
for line in snapshot_manifest.decode().splitlines():
    digest, path = line.split("  ", 1)
    assert path not in snapshots, f"duplicate legacy snapshot: {path}"
    snapshots[path] = digest
legacy_files = {str(p.relative_to(legacy)) for p in (legacy / ".apm/skills").glob("*/SKILL.md")}
assert legacy_files == snapshots.keys(), "legacy snapshot inventory changed"
for path, digest in snapshots.items():
    assert hashlib.sha256((legacy / path).read_bytes()).hexdigest() == digest, \
        f"frozen coordinator snapshot changed: {path}"
assert not list((defaults / ".apm").glob("agents/*")), "agent-defaults must be skills-only"
assert not list((defaults / ".apm").glob("instructions/*")), "no mandatory routing instructions"

writing = " ".join((skills / "writing-voice/SKILL.md").read_text().split())
for rule in (
    "Default to the user's established voice in chat and drafted artifacts",
    "Lead with the problem or outcome and its meaningful effect",
    "Prefer the shortest complete explanation, not an arbitrary word limit",
    'Avoid filler, platitudes, em dashes, and a forced "Intent" heading',
    "Never shorten by deleting essential evidence, hiding failures or limitations",
    "Distinguish reported observations, verified facts, inference, and uncertainty",
    "Routine repository validation: summarize the outcome concisely; omit routine commands and detailed result dumps",
    "Template-requested validation: preserve the template and include only the minimum requested commands, results, or procedures",
    "New reviewer-performed manual or exploratory investigation: include the procedures reviewers must perform",
    "Failed, incomplete, or unverified validation: report the failure or gap",
    "Preserve machine-readable schemas",
    "immediately before every permitted shared/public post",
    "never draft a reply on `HUMAN_STOP`",
):
    assert rule in writing, f"writing-voice: missing policy: {rule}"

# The canonical policy does not need to route to itself.
non_writers = {"writing-voice"}
writers = [
    skills / name / "SKILL.md" for name in actual - non_writers
] + list(Path("packages/development-workflow/.apm/agents").glob("*.agent.md")) \
  + list(Path("packages/code-reviewers/.apm/agents").glob("*.agent.md")) \
  + list(Path("packages/code-reviewers/.apm/skills").glob("*/SKILL.md"))
for path in writers:
    text = path.read_text()
    assert "`writing-voice`" in text, f"{path}: missing canonical authoring policy"
    assert "direct user chat only" not in text, f"{path}: voice excludes artifacts"
    assert "Do not apply to drafted artifacts" not in text, f"{path}: voice excludes artifacts"
acting = " ".join((skills / "acting-on-behalf/SKILL.md").read_text().split())
assert "Apply its final reader check immediately before every permitted post" in acting
assert 'include a compact "Evidence" section' not in acting, "forced evidence boilerplate"
lifecycle = (skills / "pr-lifecycle/SKILL.md").read_text()
assert "Rewrite body to include:" not in lifecycle, "forced PR outline"

for name in ("handoff-envelope", "consensus-panel", "review-fix-loop"):
    text = (defaults / ".apm/skills" / name / "SKILL.md").read_text()
    assert "explicit_multi_review" in text and "STOP_INVALID_HANDOFF" in text, name
for package in Path("packages").iterdir():
    config = package / "tests/promptfooconfig.yaml"
    if not config.is_file():
        continue
    for case in yaml.safe_load(config.read_text())["tests"]:
        reference = case.get("vars", {}).get("skill_content", "")
        if reference.startswith("file://"):
            source = config.parent / reference.removeprefix("file://")
            assert source.is_file(), f"{config}: broken reference: {reference}"

release_config = json.loads(Path("release-please-config.json").read_text())["packages"]
release_manifest = json.loads(Path(".release-please-manifest.json").read_text())
assert release_config.keys() == release_manifest.keys(), "release package sets differ"
assert "packages/agent-defaults" in release_config, "agent-defaults must remain released"
for package, version in release_manifest.items():
    path = Path(package)
    assert (path / "version.txt").read_text().strip() == version, f"{package}: version.txt drift"
    assert yaml.safe_load((path / "apm.yml").read_text())["version"] == version, f"{package}: apm.yml drift"
print("OK: skills-only defaults, writing policy, legacy inventory, review bootstrap, test references, and release versions.")
PY
