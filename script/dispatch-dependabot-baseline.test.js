"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");
const { dispatchBaseline } = require("./dispatch-dependabot-baseline.js");

function fixture(packageName = "agent-defaults") {
  const repository = "owner/repo";
  const sha = "a".repeat(40);
  const run = {
    id: 12, name: `Eval: ${packageName}`, path: `.github/workflows/eval-${packageName}.yml`,
    event: "pull_request", status: "completed", conclusion: "success",
    actor: { login: "dependabot[bot]" }, repository: { full_name: repository },
    head_repository: { full_name: repository }, run_attempt: 1, head_branch: "deps/action", head_sha: sha,
    pull_requests: [],
  };
  const event = { action: "completed", workflow_run: structuredClone(run) };
  const jobs = { total_count: 1, jobs: [{ name: `${packageName} lint`, status: "completed", conclusion: "success" }] };
  const pulls = [{
    state: "open", user: { login: "dependabot[bot]" },
    head: { repo: { full_name: repository }, ref: run.head_branch, sha },
    base: { repo: { full_name: repository }, ref: "main" },
  }];
  const calls = [];
  const api = async (url, options) => {
    calls.push({ url, options });
    if (url === "actions/runs/12") return run;
    if (url.startsWith("actions/runs/12/attempts/1/jobs?")) return jobs;
    if (url.startsWith("pulls?")) return pulls;
    if (url === `actions/workflows/eval-${packageName}.yml/dispatches`) return undefined;
    throw new Error(`unexpected API call ${url}`);
  };
  return { repository, run, event, jobs, pulls, calls, api };
}

test("dispatcher checks API association and sends only a static main smoke dispatch", async () => {
  for (const packageName of ["agent-defaults", "code-reviewers", "development-workflow"]) {
    const f = fixture(packageName);
    assert.equal(await dispatchBaseline(f), true);
    const call = f.calls.at(-1);
    assert.equal(call.url, `actions/workflows/eval-${packageName}.yml/dispatches`);
    assert.deepEqual(JSON.parse(call.options.body), { ref: "main", inputs: { suite: "smoke" } });
    assert.equal(call.options.method, "POST");
    assert.match(f.calls[2].url, /head=owner%3Adeps%2Faction/);
  }
});

test("dispatcher fails closed on untrusted sources and mismatched live PRs", async () => {
  const changes = [
    (f) => { f.event.action = "requested"; },
    (f) => { f.event.workflow_run.name = "__proto__"; },
    (f) => { f.event.workflow_run.event = "push"; },
    (f) => { f.event.workflow_run.actor.login = "other"; },
    (f) => { f.event.workflow_run.head_repository.full_name = "fork/repo"; },
    (f) => { f.run.path = ".github/workflows/other.yml"; },
    (f) => { f.run.actor.login = "other"; },
    (f) => { f.run.head_sha = "b".repeat(40); },
    (f) => { f.run.run_attempt = 2; },
    (f) => { f.jobs.jobs[0].conclusion = "skipped"; },
    (f) => { f.jobs.total_count = 101; },
    (f) => { f.pulls.length = 0; },
    (f) => { f.pulls[0].state = "closed"; },
    (f) => { f.pulls[0].user.login = "other"; },
    (f) => { f.pulls[0].head.repo.full_name = "fork/repo"; },
    (f) => { f.pulls[0].base.repo.full_name = "fork/repo"; },
    (f) => { f.pulls[0].base.ref = "other"; },
    (f) => { f.pulls[0].head.sha = "b".repeat(40); },
    (f) => { f.pulls.push(structuredClone(f.pulls[0])); },
  ];
  for (const change of changes) {
    const f = fixture();
    change(f);
    assert.equal(await dispatchBaseline(f), false, change.toString());
    assert.ok(f.calls.every(({ options }) => !options), change.toString());
  }
  const f = fixture();
  await assert.rejects(dispatchBaseline({ ...f, api: async () => { throw new Error("unavailable"); } }), /unavailable/);
});

test("dispatcher workflow has no Copilot permission or untrusted checkout", () => {
  const workflow = yaml.load(fs.readFileSync(path.join(__dirname, "../.github/workflows/eval-dependabot-baseline.yml"), "utf8"));
  assert.deepEqual(workflow.permissions, { actions: "write", contents: "read", "pull-requests": "read" });
  assert.deepEqual(workflow.on.workflow_run.types, ["completed"]);
  const steps = workflow.jobs.dispatch.steps;
  assert.equal(steps[0].with.ref, "main");
  assert.equal(steps[0].with["persist-credentials"], false);
  assert.equal(steps.length, 2);
  assert.equal(steps[1].run, "node script/dispatch-dependabot-baseline.js");
});
