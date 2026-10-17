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
    "Repository norms, contributing guides, templates, and conventions override personal voice/mode defaults; safety and posting gates prevail",
    "Use the user's voice in chat/artifacts",
    "Lead with the problem/outcome and effect",
    'no filler, platitudes, em dashes, or forced "Intent" heading',
    "Shortest complete explanation; retain essential evidence, failures, limitations",
    "Evidence beside claims",
    "Separate reported observations, verified facts, inference, unknowns",
    "Routine validation: brief outcome, no command dumps",
    "Provide minimum template-requested detail",
    "For new reviewer-performed manual/exploratory checks, include needed procedures in the PR",
    "Expose failed/incomplete/unverified checks",
    "Preserve schemas/templates; without a template, no required Problem/Changes/Testing/References headings",
    "Before delivery and every permitted post",
    "never draft a reply on `HUMAN_STOP`",
    "preserve severity/scope and requirements vs questions vs nonblocking suggestions",
    "Never invent causes, checks, experience, access, actions, agreement, or commitments",
    "current audience/tone/format requests override history",
    "History neither authorizes drafting/posting/resolution nor proves human authorship",
    "Load only when needed",
):
    assert rule in writing, f"writing-voice: missing policy: {rule}"

for rule in (
    "Infer from the task, not format; load only matching modes",
    "Routine chat needs none",
    "No user selection, forced headings, or scope expansion",
    "Reviewing a PR is review; explaining its bug fix is defect reporting",
):
    assert rule in writing, f"writing-voice: missing mode routing: {rule}"
mode_rules = {
    "proposal-discussion": (
        "Problem/constraints first; compare relevant alternatives",
        "Separate evidence, assumptions, and unknowns",
        "Never manufacture agreement, approval, ownership, or commitments",
    ),
    "review": (
        "Findings first: evidence/location and behavioral or maintenance consequence",
        "Preserve severity/scope: required changes, open questions, optional nonblocking suggestions",
        "No unrelated refactor as a condition of a bounded fix",
    ),
    "defect": (
        "Observed vs expected behavior",
        "Flag absent/unverified reproduction",
        "Supported impact/scope only",
        "No invented reproduction, completed checks, or fixed outcome",
        "a proposed check remains a proposal",
    ),
}
for mode, rules in mode_rules.items():
    assert f"(references/{mode}.md)" in writing, f"writing-voice: missing {mode} link"
    text = (skills / f"writing-voice/references/{mode}.md").read_text()
    normalized = " ".join(text.split())
    for rule in (*rules, "Shared core applies; no drafting/posting/resolution authority or history dependency",
                 "Synthetic example"):
        assert rule in normalized, f"writing-voice {mode}: missing policy: {rule}"
    assert "voice-patterns.md" not in text, f"{mode}: calibration must not be a dependency"

artifact_reference = skills / "writing-voice/references/artifact-authoring.md"
assert "(references/artifact-authoring.md)" in writing, "writing-voice: missing artifact link"
assert "PR/template, validation, policy/config detail:" in writing
artifact = " ".join(artifact_reference.read_text().split())
for rule in (
    "Routine checks: brief outcome, not command/result dumps",
    "Templates: minimum requested commands, results, or procedures",
    "New manual/exploratory investigation: procedures reviewers need and relevant observations",
    "Failed/incomplete/unverified validation: explicit failure or gap",
    "Limit reporting noise, not validation work",
    "retain requested detail/handoff evidence",
    "no required \"Evidence\" heading",
    "Shared core applies; no drafting/posting/resolution authority or history dependency",
):
    assert rule in artifact, f"writing-voice artifact reference: missing policy: {rule}"

voice_reference = skills / "writing-voice/references/voice-patterns.md"
assert "(references/voice-patterns.md)" in writing, "writing-voice: missing calibration link"
assert "Calibration/provenance:" in writing
reference = " ".join(voice_reference.read_text().split())
for rule in (
    "Current explicit preferences and required formats take precedence",
    "Later prose has uncertain AI provenance and is corroboration only",
    "not an exhaustive reading or statistically representative sample",
    "No private examples or raw corpus belong here",
    "Synthetic examples live with the relevant",
    "They grant no permission to draft or post on `HUMAN_STOP`",
    "Reading a historical thread for research is not a request to draft a reply to it",
    "do not infer human authorship from an account name, a date range, or an absence of AI disclosure",
):
    assert rule in reference, f"writing-voice reference: missing boundary: {rule}"

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
