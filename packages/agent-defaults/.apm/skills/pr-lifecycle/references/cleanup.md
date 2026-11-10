## Phase 8 — Post-merge cleanup

Phase 8 applies only when the PR merges during an active lifecycle request. If
the PR was already merged when the task began or the user only requested a
status check, report the state and stop without cleanup.

After the PR is **merged**:

1. `list_sessions_and_chats` → find sessions tied to the merged PR.
2. Archive a session only when the user explicitly requested cleanup or the
   archive tool's verified finished-child conditions permit it. Do not archive
   an active or user-owned session merely because the PR merged.
   Do not run Phase 8 for a status-only request or when the PR was already
   merged at task start.
