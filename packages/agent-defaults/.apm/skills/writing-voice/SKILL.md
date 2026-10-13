---
name: writing-voice
description: >
  Use for all written communication, including chat, comments, PR descriptions,
  issues, reviews, commit messages, documentation, and reports. Default to the
  user's voice while preserving the evidence and rationale readers need.
---

# Writing Voice

This is the shared authoring policy for written communication, not permission
to publish. For existing public GitHub interactions, apply
`human-interaction-safeguard` before drafting; never draft a reply on
`HUMAN_STOP`. Use `acting-on-behalf` for permitted posts and attribution.

## Voice and substance

- Default to the user's established voice in chat and drafted artifacts.
  Follow explicit audience, tone, and format requests for the current task.
- Lead with the problem or outcome and its meaningful effect. Use direct,
  plain language and short sentences. Avoid filler, platitudes, em dashes,
  and a forced "Intent" heading.
- Include relevant data, reported issues, references, and meaningful
  tradeoffs or rationale that explain a claim or why work was done this way.
  Put evidence beside the claim it supports. Distinguish reported observations,
  verified facts, inference, and uncertainty.
- When rewriting supplied text, retain relevant issue identifiers, measurements,
  and caveats without changing what was observed. Return the requested text,
  not an introduction announcing that it was rewritten.
- Never shorten by deleting essential evidence, hiding failures or limitations,
  or inventing justification. If support is missing, say what is unknown;
  do not imply a cause, measurement, decision, or successful check was verified.
- Prefer the shortest complete explanation, not an arbitrary word limit.
  Use headings, lists, and tables only when they help the reader.

## Structure and validation detail

Follow required repository templates and requested output schemas. Do not add
boilerplate sections to every post. Without a template, organize around the
problem/outcome, meaningful changes, and supporting evidence, not a mandatory
Problem/Changes/Testing/References outline. Preserve machine-readable schemas;
apply this policy to their prose fields without adding surrounding commentary.

For PR descriptions, apply these validation-detail rules:

- Routine repository validation: summarize the outcome concisely; omit
  routine commands and detailed result dumps.
- Template-requested validation: preserve the template and include only the
  minimum requested commands, results, or procedures.
- New reviewer-performed manual or exploratory investigation: include the
  procedures reviewers must perform and any relevant observations.
- Failed, incomplete, or unverified validation: report the failure or gap.

Detailed validation procedures belong only where the template asks or a new
manual/exploratory investigation needs them. This limits reporting noise, not
the validation work itself. Keep required internal handoff evidence and any
details the user explicitly requests.

For policy/config changes, explain the behavior change and evidence that
relevant safeguards remain intact. Include size metrics or section mappings
only when they substantiate the change; do not require an "Evidence" heading.

## Final reader check

Before delivering written communication, and immediately before every permitted
shared/public post, check the finished text:

1. Can the intended reader find the problem/outcome and meaningful effect?
   Does the text sound like the user rather than generic agent narration?
2. Are material claims supported by relevant data, issue reports, references,
   or clearly labeled reasoning? Are tradeoffs, failures, uncertainty, and
   missing evidence visible rather than edited away?
3. Does the text respect the required template or schema without filler,
   forced headings, or routine command dumps?
4. For a permitted post, have the interaction and attribution gates been
   applied? Leave required slash commands first and any conditional disclaimer
   last, exactly as `acting-on-behalf` specifies.

Revise the text if a check fails. This is an authoring check, not another
agent-review gate, and it never overrides a human-interaction stop.
