const test = require("node:test");
const assert = require("node:assert/strict");
const { validateTitle } = require("./validate-pr-title");

test("accepts valid Conventional Commits titles", () => {
  for (const title of [
    "feat: add title validation",
    "fix(ci): pin the APM version",
    "refactor!: remove a legacy interface",
    "docs(agent-defaults)!: clarify package compatibility",
    "chore(deps-dev): Bump @hono/node-server from 2.1.5 to 2.1.8 in the npm_and_yarn group across 1 directory",
    `feat: ${"😀".repeat(67)}`,
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
    `feature: ${"a".repeat(73)}`,
    undefined,
  ]) {
    assert.notEqual(validateTitle(title).length, 0, title);
  }
});
