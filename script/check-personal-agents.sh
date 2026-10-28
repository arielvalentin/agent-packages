#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
python3 <<'PY'
from pathlib import Path
import hashlib
import json
import sys
import yaml

if sys.flags.optimize:
    raise SystemExit("Run without PYTHONOPTIMIZE: this contract requires assertions.")

package = Path("packages/personal-agents")
expected = {
    "se-security-reviewer.agent.md": "SE: Security",
    "se-technical-writer.agent.md": "SE: Tech Writer",
    "custom-agent-foundry.agent.md": "Custom Agent Foundry",
    "agent-governance-reviewer.agent.md": "Agent Governance Reviewer",
}
manifest = yaml.safe_load((package / "apm.yml").read_text())
assert set(manifest) == {"name", "version", "description", "license"}, \
    "personal-agents must not add dependencies, hooks or permission settings"
assert manifest["name"] == "personal-agents" and manifest["license"] == "MIT"
provenance = json.loads((package / "provenance.json").read_text())
assert provenance["repository"] == "https://github.com/github/awesome-copilot"
assert provenance["commit"] == "d75b41863510272ed217a3074c7045202b96e93f"
assert provenance["agents"].keys() == expected.keys(), "unexpected provenance inventory"
assert {p.relative_to(package / ".apm").as_posix()
        for p in (package / ".apm").rglob("*") if p.is_file()} == {
    f"agents/{name}" for name in expected
}, "personal-agents must contain only the four native agent resources"
assert not any(p.is_symlink() for p in package.rglob("*")), "no symlinked resources"

def digest(data):
    return hashlib.sha256(data).hexdigest()

license_hash = "e32449d23085399adc1222f7a17408b730550258e51627c153cb108ca9955823"
assert provenance["license"] == {"path": "LICENSE", "sha256": license_hash}
assert digest((package / "LICENSE").read_bytes()) == license_hash, "upstream MIT notice changed"
for filename, display_name in expected.items():
    record = provenance["agents"][filename]
    assert record["source"] == f"agents/{filename}", filename
    data = (package / ".apm/agents" / filename).read_bytes()
    assert digest(data) == record["sha256"], f"{filename}: variant hash drift"
    text = data.decode("utf-8")
    assert text.startswith("---\n"), filename
    frontmatter, body = text[4:].split("\n---\n", 1)
    assert body.strip(), f"{filename}: missing prompt body"
    metadata = yaml.safe_load(frontmatter)
    assert metadata["name"] == display_name, filename
    assert isinstance(metadata["description"], str) and metadata["description"].strip(), filename
    assert isinstance(metadata["tools"], list) and metadata["tools"], filename
    assert "model" not in metadata, f"{filename}: model override reintroduced"
    line = record["removedLine"]
    position = record["removedLineNumber"] - 1
    assert line.startswith("model: ") and line.endswith("\n") and line.count("\n") == 1
    lines = data.splitlines(keepends=True)
    assert 0 < position <= len(frontmatter.splitlines()) + 1, filename
    lines.insert(position, line.encode())
    original = b"".join(lines)
    assert digest(original) == record["upstreamSha256"], \
        f"{filename}: content differs from upstream beyond the model line"
    original_metadata = yaml.safe_load(original.decode()[4:].split("\n---\n", 1)[0])
    assert original_metadata.pop("model"), filename
    assert original_metadata == metadata, f"{filename}: metadata or tools changed"

version = (package / "version.txt").read_text().strip()
assert str(manifest["version"]) == version
release_path = package.as_posix()
releases = json.loads(Path("release-please-config.json").read_text())
release = releases["packages"][release_path]
assert release["component"] == "personal-agents" and release["release-type"] == "simple"
assert release["initial-version"] == "0.1.0"
assert {"type": "yaml", "path": "apm.yml", "jsonpath": "$.version"} in release["extra-files"]
assert json.loads(Path(".release-please-manifest.json").read_text())[release_path] == version
print("OK: Four model-free agents, upstream-only delta, MIT license and release registration.")
PY
