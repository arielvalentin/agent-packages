---
name: tech-research
description: >
  Efficient technical research workflow for GitHub, official documentation,
  the public web, and internal data sources. Plans source-aware queries,
  prevents duplicate same-backend research, captures evidence, and synthesizes
  findings into an answer, design input, or technical document.
---

# Tech Research

Use this skill for technical fact-finding, option analysis, prior-art searches,
and evidence gathering. Research is not a consensus exercise: one agent gathers
facts from each source, and the coordinator synthesizes.

## 1. Frame the research

Before dispatching:

1. State the research question and decision it supports.
2. Define the expected output: concise answer, recommendation, design input, or
   technical document.
3. Record constraints such as repository, product version, date range, approved
   sources, and required evidence.
4. Ask a clarifying question only when the question or success condition is
   genuinely ambiguous.

Use `rubber-duck` to challenge assumptions in the research plan, not to repeat
the research itself.

## 2. Build a source plan

Create a compact plan before making queries:

Define a backend by its underlying host/API, credentials, and rate-limit bucket,
not by the client used to access it. For example, GitHub queries made through
`gh`, REST, GraphQL, or GitHub web URLs share the GitHub backend and must not be
parallelized as separate sources.

| Source/backend | Question | Agent/tool | Order |
|----------------|----------|------------|-------|
| GitHub/repository | related code, issues, commits, or prior art | `research`, `gh`, local search | sequential within GitHub |
| Official product docs | supported behavior and current guidance | product documentation tool | sequential within each docs backend |
| Public web | external standards, upstream projects, or comparisons | `research` or web fetch | sequential within the web backend |
| Internal data source | production evidence or operational history | source-specific skill/tool | sequential within that backend |

Combine overlapping questions before dispatch. Do not create multiple tasks that
will search the same source for the same facts.

## 3. Dispatch efficiently

Use this decision rule:

| Relationship between queries | Parallel dispatch? | Action |
|------------------------------|--------------------|--------|
| Same backend/rate-limit bucket | **No** | Combine overlapping questions and run remaining queries sequentially |
| Distinct backends/rate-limit buckets | **Yes** | Run independent queries concurrently |

- Use **one research agent per source/backend**.
- **Parallelize independent queries across genuinely distinct backends.** For
  example, GitHub, Azure documentation, and the public web may be researched
  concurrently because they use separate rate-limit domains.
- Run multiple queries to the same backend sequentially to reduce rate-limit
  pressure.
- Never dispatch identical same-source research to multiple models for
  consensus.
- Give each agent a source-bounded prompt and instruct it not to repeat queries
  assigned to another agent.
- Prefer one well-scoped request over many small searches.

Research agents are single-model. Do not route fact-finding through
`consensus-panel`.

## 4. Require evidence

Each research result must include:

- Source URL, repository path, issue/PR/commit reference, or query identifier.
- The specific fact supported by that source.
- Version, publication date, or retrieval date for each external or
  time-sensitive source. If freshness is not applicable, say so explicitly.
- Any uncertainty, missing access, conflicting evidence, or source limitation.

Prefer primary sources: repository code and history, official documentation,
specifications, and first-party announcements. Clearly label secondary-source
claims.

## 5. Synthesize once

The coordinator synthesizes all source results:

1. Deduplicate repeated facts.
2. Separate verified facts from inference.
3. Reconcile conflicts using source authority and freshness.
4. Identify unanswered questions without launching speculative extra searches.
5. Produce a recommendation only when the evidence supports one.

Do not ask several agents to produce competing final syntheses. Consensus panels
are for judgment-heavy reviews, not fact collection.

## 6. Route the output

| Deliverable | Destination |
|-------------|-------------|
| Short factual answer with no durable artifact | Return inline |
| Design or architectural decision input | `system-architect` |
| Documentation, report, or tutorial | `se-technical-writer` |
| Large or reusable findings | Persist as a research artifact and return its path |

When handing research to another agent, write the synthesized findings as an
artifact, pass it through `handoff-envelope.inputs.artifact_paths`, and instruct
the recipient not to re-query covered backends unless the coordinator explicitly
requests additional evidence.

## Final output

Include:

- Research question.
- Sources/backends consulted.
- Evidence-backed findings with citations.
- Conflicts, limitations, and remaining unknowns.
- Recommendation or next decision, when applicable.

## Boundaries

- Do not open an early draft PR for research-only work.
- Do not duplicate same-source queries for confidence or consensus.
- Do not present inference as fact.
- Do not hide rate limits, access failures, or stale sources.
- Do not expand the research scope without user approval.
