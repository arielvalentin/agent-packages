---
name: pr-feedback-review
description: >
  Structured protocol for reviewing, researching, and responding to PR review
  comments — whether implementing fixes or rebutting invalid concerns.
---

# PR Feedback Review

A structured protocol for reviewing, researching, and responding to PR review
comments. Load this skill when addressing PR feedback — whether implementing
fixes or rebutting invalid concerns.

`human-interaction-safeguard` is the single source of truth for actor
classification and behavior. Load it before acting on any thread.

## When to Use

- User asks to "address PR feedback", "respond to review comments", "handle
  PR reviews", or "resolve PR threads"
- Coordinator dispatches existing-PR-iteration flow
- Any request to review and act on PR comment threads

## Protocol

### Step 1: Read, Classify, and Understand

Read **every** review comment and thread on the PR. For each comment:

- Classify the author through `human-interaction-safeguard`.
- Identify the **specific concern** (correctness, style, performance, security,
  design, docs, etc.)
- Note whether it's a blocking request, suggestion, or question
- Understand the reviewer's reasoning — not just what they said, but *why*

Do not skim or assume. Classify the actor before any research or action.

### Step 2: Stop for Human or Unknown Actors

For every human-authored comment, and every comment whose actor type is unknown,
follow `human-interaction-safeguard`:

1. Stop automation for that interaction.
2. Privately summarize the concern and apparent intent for the user.
3. Prompt the user to engage directly in the thread.
4. Do not research toward a rebuttal, implement a change, draft or post a reply,
   or resolve the thread solely because of the comment.

If the user later explicitly requests a specific implementation, it may proceed
as a new user instruction. The reply remains for the user to write unless the
user explicitly overrides the safeguard for that identified interaction.

Only bot/app-authored feedback continues to Step 3.

### Step 3: Research Bot/App Feedback

For each concern, investigate:

- Read the code in question and surrounding context
- Check language/framework documentation and conventions
- Look at existing patterns in the repo (`AGENTS.md`, style guides, prior art)
- Consult relevant specs, RFCs, or official docs when the concern is about
  correctness or best practices
- Form your own informed conclusion about whether the feedback is valid

### Step 4: Decide and Act on Bot/App Feedback

For each bot/app-authored comment thread, choose one:

#### Accept — the feedback is valid

1. Implement the fix (surgical change, don't over-correct)
2. Commit with a clear message referencing the concern
3. Reply to the comment:
   - Acknowledge the concern briefly
   - State `Fixed in <commit-sha>`
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
   - Comments accepted (with commit SHAs)
   - Comments rebutted (with evidence cited)
   - Comments needing clarification (questions asked)

## Rules

- **Always load `acting-on-behalf`** before posting any permitted reply
- **Defer actor behavior to `human-interaction-safeguard`** — never replace its
  stop rule with accept/rebut/clarify automation
- **Never blindly apply** bot/app suggestions — use judgement backed by evidence
- **Never ignore** valid bot/app concerns — if you're unsure, lean toward
  accepting
- **One commit per logical fix** when addressing multiple comments (don't lump
  unrelated fixes)
- **Keep fixes scoped** to what the reviewer asked — don't refactor adjacent code
- **Be respectful** in rebuttals — disagree with evidence, not attitude
