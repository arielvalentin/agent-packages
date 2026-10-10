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
    "review-fix-loop", "stage-pr", "tech-research",
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
print("OK: skills-only defaults, legacy inventory, review bootstrap, test references, and release versions.")
PY
