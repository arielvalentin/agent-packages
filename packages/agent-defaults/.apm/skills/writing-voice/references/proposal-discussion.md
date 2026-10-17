# Proposal/discussion mode

Shared core applies; no drafting/posting/resolution authority or history dependency.

- Problem/constraints first; compare relevant alternatives, including the status
  quo, and tradeoffs. Do not invent requirements or expand decision scope.
- Separate evidence, assumptions, and unknowns; calibrate recommendations to support.
- Name the decision/input needed. Never manufacture agreement, approval,
  ownership, or commitments; a proposal is not an accepted plan.

## Synthetic example

Private fixture, not a thread reply: unbounded queue; proposed 100-item cap
rejects excess work; backpressure latency is unmeasured.

> The queue is unbounded. A 100-item cap limits queued work but rejects excess
> requests. Backpressure is an alternative with an unmeasured latency cost.
> Decide whether rejecting work at capacity is acceptable before choosing.

No load-test result, approval, or commitment is supplied.
