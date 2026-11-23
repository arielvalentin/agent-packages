"use strict";

const workflows = Object.freeze({
  "Eval: agent-defaults": "eval-agent-defaults.yml",
  "Eval: code-reviewers": "eval-code-reviewers.yml",
  "Eval: development-workflow": "eval-development-workflow.yml",
});

async function dispatchBaseline({ event, repository, api }) {
  const source = event.workflow_run;
  const filename = Object.hasOwn(workflows, source?.name) ? workflows[source.name] : undefined;
  if (!filename || event.action !== "completed" ||
      source.event !== "pull_request" || source.status !== "completed" || source.conclusion !== "success" ||
      source.actor?.login !== "dependabot[bot]" ||
      source.repository?.full_name !== repository ||
      source.head_repository?.full_name !== repository ||
      !Number.isSafeInteger(source.id) || !Number.isSafeInteger(source.run_attempt)) return false;

  const run = await api(`actions/runs/${source.id}`);
  if (run.id !== source.id || run.name !== source.name || run.path !== `.github/workflows/${filename}` ||
      run.event !== "pull_request" || run.status !== "completed" || run.conclusion !== "success" ||
      run.actor?.login !== "dependabot[bot]" ||
      run.repository?.full_name !== repository ||
      run.head_repository?.full_name !== repository ||
      run.run_attempt !== source.run_attempt || run.head_sha !== source.head_sha ||
      !/^[a-f0-9]{40}$/.test(run.head_sha) ||
      typeof run.head_branch !== "string" || !run.head_branch) return false;

  const jobs = await api(`actions/runs/${source.id}/attempts/${source.run_attempt}/jobs?per_page=100`);
  const lintName = `${filename.slice(5, -4)} lint`;
  if (!Array.isArray(jobs.jobs) || !Number.isSafeInteger(jobs.total_count) ||
      jobs.total_count !== jobs.jobs.length || jobs.total_count > 100) return false;
  const lint = jobs.jobs.filter((job) => job.name === lintName);
  if (lint.length !== 1 || lint[0].status !== "completed" || lint[0].conclusion !== "success") return false;

  const owner = repository.split("/")[0];
  const query = new URLSearchParams({ state: "open", head: `${owner}:${run.head_branch}`, per_page: "100" });
  const pulls = await api(`pulls?${query}`);
  if (!Array.isArray(pulls) || pulls.length >= 100) return false;
  const matches = pulls.filter((pr) =>
    pr.state === "open" && pr.user?.login === "dependabot[bot]" &&
    pr.head?.repo?.full_name === repository && pr.base?.repo?.full_name === repository &&
    pr.base?.ref === "main" && pr.head?.ref === run.head_branch && pr.head?.sha === run.head_sha);
  if (matches.length !== 1) return false;

  await api(`actions/workflows/${filename}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: "main", inputs: { suite: "smoke" } }),
  });
  return true;
}

async function main() {
  const fs = require("node:fs");
  const repository = process.env.GITHUB_REPOSITORY;
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const base = `${process.env.GITHUB_API_URL}/repos/${repository}/`;
  const api = async (path, options = {}) => {
    const response = await fetch(new URL(path, base), {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) throw new Error(`GitHub API request failed: ${response.status}`);
    return response.status === 204 ? undefined : response.json();
  };
  console.log(await dispatchBaseline({ event, repository, api }) ? "Baseline dispatched." : "No eligible baseline.");
}

if (require.main === module) main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

module.exports = { dispatchBaseline };
