---
name: pr-feedback-review
description: >
  Structured protocol for reviewing, researching, and responding to PR review
  comments — whether implementing fixes or rebutting invalid concerns.
---

# PR Feedback Review

Use when addressing PR feedback, whether implementing fixes or rebutting
concerns. Before any interaction-derived research or action, load
`human-interaction-safeguard` for complete-chain retrieval, classification, and
behavior. If unavailable, fail closed as `HUMAN_STOP`.

## When to Use

- User asks to "address PR feedback", "respond to review comments", "handle
  PR reviews", or "resolve PR threads"
- Calling agent handles an existing-PR iteration
- Any request to review and act on PR comment threads

## Protocol

### Step 1: Read, Classify, and Understand

Read **every** review comment and thread on the PR. Group comments and replies
into their complete relevant thread or conversation chain. For each chain:

- Classify every author through `human-interaction-safeguard`.
- Apply its thread/chain rule: any `HUMAN_STOP` item taints the whole chain.
  A chain proceeds as `AUTOMATION_FLOW` only when every item is authoritatively
  identified as Bot/App automation.
- Identify the **specific concern** (correctness, style, performance, security,
  design, docs, etc.)
- Note whether it's a blocking request, suggestion, or question
- Understand the reviewer's reasoning — not just what they said, but *why*

Do not skim or assume. Classify the actor before any research or action.

### Step 2: Stop for Human or Unknown Actors

For `HUMAN_STOP`, stop interaction-derived work and follow
`human-interaction-safeguard` for the private warning, eligibility, and
single-reply confirmation. Do not research a rebuttal, change the repository,
draft/post, or resolve from that interaction without its scoped authorization.
Unknown actors and incomplete retrieval cannot be overridden.

Classification stays `HUMAN_STOP` after confirmation; do not enter Steps 3-4 or
automate further iteration. A draft-only request never permits posting; reply
confirmation never permits implementation, resolution, merging, or unrelated
actions. A later, separate, explicit implementation instruction identifying
the concern may authorize code/config/test work, not replies or resolution.

Only completely retrieved `AUTOMATION_FLOW` chains continue to Step 3; never
split Bot/App comments out of a tainted chain.

For permitted drafts and private summaries, use `writing-voice`. Do not turn a
private summary of human feedback into a draft reply.

### Step 3: Research Permitted Feedback

For each concern, investigate:

- Read the code in question and surrounding context
- Check language/framework documentation and conventions
- Look at existing patterns in the repo (`AGENTS.md`, style guides, prior art)
- Consult relevant specs, RFCs, or official docs when the concern is about
  correctness or best practices
- Form your own informed conclusion about whether the feedback is valid

### Step 4: Decide and Act on Permitted Feedback

For `AUTOMATION_FLOW` threads, choose one, subject to the user's requested
scope and all remaining permission and posting gates:

#### Accept — the feedback is valid

1. Implement the fix (surgical change, don't over-correct)
2. Commit with a clear message referencing the concern
3. Reply to the comment:
   - Acknowledge the concern briefly
   - State `Fixed in <commit-sha>` only when that SHA is appropriate for the
     destination audience under `acting-on-behalf`'s disclosure boundary; otherwise
     describe the fix without a private identifier.
4. Resolve the thread

#### Rebut — the feedback is incorrect or misguided

1. Draft a respectful, evidence-based rebuttal
2. Include at least one of:
   - Link to official documentation
   - Link to language/framework spec
   - Code example showing why the current approach is correct
   - Reference to an existing repo convention or `AGENTS.md` rule
3. Reply to the comment with your rebuttal
4. **Do NOT resolve the thread** — let the reviewer decide

#### Clarify — the comment is ambiguous or needs discussion

1. Reply with a specific clarifying question
2. Do NOT resolve the thread
3. Do NOT implement speculative changes

### Step 5: Verify

After all comments are addressed:

1. Run the relevant test/lint/build commands to verify nothing broke
2. Resume `pr-lifecycle` Phase 4 if changes were pushed
3. Summarize actions taken:
   - Human/unknown comments routed to the user (no automated action)
   - Comments accepted (with disclosure-safe commit references)
   - Comments rebutted (with evidence cited)
   - Comments needing clarification (questions asked)

## Rules

- **Always load `acting-on-behalf`** before posting any permitted reply; if
  unavailable or disclosure is unresolved, do not post.
- **Never blindly apply** bot/app suggestions — use judgement backed by evidence
- **Never ignore** valid bot/app concerns — if you're unsure, lean toward
  accepting
- **One commit per logical fix** when addressing multiple comments (don't lump
  unrelated fixes)
- **Keep fixes scoped** to what the reviewer asked — don't refactor adjacent code
- **Be respectful** in rebuttals — disagree with evidence, not attitude
