# Clean main worktree

## Design

Make the development checkout a clean `main` worktree at the latest GitHub
commit. Preserve local work and carry forward deployment notes that are absent
from `main`. The bus quiet-gap implementation is already committed as `50b09c3`.

## Plan (before changes)

1. Compare every local modified and untracked file with `origin/main` to
   identify unique content and duplicate committed content.
2. Integrate unique documentation into the clean integration worktree and
   review the diff. Commit and push the documentation to `main`.
3. Save the original development edits in a named Git stash for recovery.
4. Remove only stale, missing worktree registrations, switch this checkout to
   `main`, and fast-forward it to the pushed commit.
5. Verify `main`, `origin/main`, and the working tree status. Leave the
   production checkout and services running their current deployed commit;
   documentation changes do not require a restart.

No schema, API, UX, or hardware behavior changes are part of this cleanup.
