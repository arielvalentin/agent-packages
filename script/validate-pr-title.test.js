const test = require("node:test");
const assert = require("node:assert/strict");
const { validateTitle } = require("./validate-pr-title");

test("accepts valid Conventional Commits titles", () => {
  for (const title of [
    "feat: add title validation",
    "fix(ci): pin the APM version",
    "refactor!: remove a legacy interface",
    "docs(agent-defaults)!: clarify package compatibility",
  ]) {
    assert.deepEqual(validateTitle(title), [], title);
  }
});

test("rejects malformed types, scopes, and descriptions", () => {
  for (const title of [
    "feature: add a feature",
    "fix:",
    "fix:   ",
    "fix(): add a description",
    "fix( ): add a description",
    "fix(scope):",
  ]) {
    assert.notEqual(validateTitle(title).length, 0, title);
  }
});

test("enforces the 72-character maximum", () => {
  const prefix = "feat: ";
  assert.deepEqual(validateTitle(prefix + "a".repeat(72 - prefix.length)), []);
  assert.match(validateTitle(prefix + "a".repeat(73 - prefix.length))[0], /72 characters/);
});

test("counts Unicode code points as characters", () => {
  assert.deepEqual(validateTitle(`feat: ${"😀".repeat(66)}`), []);
  assert.match(validateTitle(`feat: ${"😀".repeat(67)}`)[0], /72 characters/);
});
