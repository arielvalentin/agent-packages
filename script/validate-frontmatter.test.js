const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const validatorPath = path.join(__dirname, "validate-frontmatter.js");
const primitives = {
  agent: ".apm/agents/example.agent.md",
  skill: ".apm/skills/example/SKILL.md",
  instructions: ".apm/instructions/example.instructions.md",
};
const metadata = {
  agent: 'name: "Example: agent"\ndescription: Example agent',
  skill: "name: example\ndescription: Example skill",
  instructions: "description: Example instructions",
};

function runValidator(files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "frontmatter-"));
  try {
    const packages = path.join(directory, "packages");
    fs.mkdirSync(packages);
    for (const [relative, content] of Object.entries(files)) {
      const file = path.join(packages, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
    return spawnSync(process.execPath, [validatorPath, packages], { encoding: "utf8" });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function document(frontmatter) {
  return `---\n${frontmatter}\n---\n# Body\nBody text with --- is not frontmatter.\n`;
}

test("validates all primitive types across every package, including hidden and nested paths", () => {
  const files = {};
  for (const pkg of [
    "agent-defaults", "coordinator", "development-workflow", "code-reviewers",
    "personal-agents", "future-package",
  ]) {
    for (const [kind, relative] of Object.entries(primitives)) {
      files[`${pkg}/nested/${relative}`] = document(metadata[kind]);
    }
  }
  files["future-package/README.md"] = "No frontmatter needed";
  const result = runValidator(files);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Validated frontmatter in 18 primitive file\(s\)/);
});

test("accepts folded descriptions, optional agent fields, and CRLF headers", () => {
  const result = runValidator({
    [`personal-agents/${primitives.agent}`]: document(
      `${metadata.agent}\ntools: ['codebase', 'edit/editFiles']`
    ),
    [`code-reviewers/${primitives.agent}`]: document(
      `${metadata.agent}\nmode: subagent\nuser-invocable: true`
    ),
    [`agent-defaults/${primitives.instructions}`]: document(
      `${metadata.instructions}\napplyTo: '**/*.js'`
    ),
    [`coordinator/${primitives.skill}`]: document(
      "name: example\ndescription: >-\n  A folded\n  description"
    ).replaceAll("\n", "\r\n"),
  });
  assert.equal(result.status, 0, result.stderr);
});

for (const [kind, relative] of Object.entries(primitives)) {
  for (const [label, content, error] of [
    ["missing header", "# Body\n", /missing opening/],
    ["header not at start", `# Body\n${document(metadata[kind])}`, /missing opening/],
    ["missing closing delimiter", `---\n${metadata[kind]}\n# Body\n`, /missing closing/],
    ["invalid YAML", document("description: [unclosed"), /invalid YAML/],
    ["duplicate keys", document(`${metadata[kind]}\ndescription: Duplicate`), /invalid YAML/],
    ["empty YAML", document(""), /YAML mapping/],
    ["scalar YAML", document("text"), /YAML mapping/],
    ["sequence YAML", document("- description: Example"), /YAML mapping/],
    ["missing description", document("name: example"), /description.*nonempty string/],
    ["blank description", document(`${metadata[kind]}\n`.replace(
      /description: [^\n]*/, 'description: " "'
    )), /description.*nonempty string/],
    ["non-string description", document(metadata[kind].replace(
      /description: [^\n]*/, "description: true"
    )), /description.*nonempty string/],
  ]) {
    test(`${kind}: rejects ${label} outside agent-defaults`, () => {
      const file = `other-package/${relative}`;
      const result = runValidator({ [file]: content });
      assert.equal(result.status, 1, result.stderr);
      assert.ok(result.stderr.includes(file), result.stderr);
      assert.match(result.stderr, error);
    });
  }
  if (kind !== "instructions") {
    for (const name of [null, "", " ", 42, false, [], {}]) {
      test(`${kind}: rejects invalid required name ${JSON.stringify(name)}`, () => {
        const frontmatter = name === null
          ? "description: Example"
          : `name: ${JSON.stringify(name)}\ndescription: Example`;
        const result = runValidator({ [`other-package/${relative}`]: document(frontmatter) });
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stderr, /name.*nonempty string/);
      });
    }
  }
}

test("rejects unsupported YAML directives", () => {
  const result = runValidator({
    [`other-package/${primitives.skill}`]: document(
      `%YAML 1.3\n---\n${metadata.skill}`
    ),
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /invalid YAML/);
});

test("reports failures in multiple packages instead of stopping at the first file", () => {
  const result = runValidator({
    [`code-reviewers/${primitives.agent}`]: "# Missing header",
    [`coordinator/${primitives.skill}`]: document("name: example"),
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /code-reviewers\/.*missing opening/);
  assert.match(result.stderr, /coordinator\/.*description/);
  assert.match(result.stderr, /2 primitive file\(s\) failed/);
});

test("refuses success when no primitives were discovered", () => {
  const result = runValidator({ "example/README.md": "# Readme" });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /No primitive files found/);
});
