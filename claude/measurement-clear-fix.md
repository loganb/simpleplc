# measurement-clear-fix

status: historical investigation; clear data has since been removed.

the shared safari pointer-focus fix remains for delete. clear-only API, UI,
reset machinery and tests described below are superseded by
`claude/remove-measurement-clear.md`.

## design and findings

restore the existing clear-data behavior: confirmation, a store patch that
removes retained samples and rollups, then an immediate empty/refreshed graph.
keep measurement identity, attachment, and subsequent recording intact.

existing tests separately exercise the menu request and history reset hook;
they do not demonstrate the full successful menu-to-graph path. the inspected
development log contains no clear_data requests, but the user was viewing
production, so that absence does not diagnose the issue. local safari testing
confirmed that pointer activation closed the menu before confirmation, while
keyboard activation opened confirmation. do not erase actual measurement history to reproduce this.

## implementation plan

1. reproduce a complete clear interaction with seeded, mocked history through
   the real store. cover confirmation, request completion, and graph props.
   exercise pointer/focus ordering if the request never starts.
2. add a failing regression for the observed break, including an old in-flight
   history response where applicable.
3. delegate the smallest targeted fix and regression to luna, then review it.
   use existing store mutation and transaction conventions.
4. run the focused frontend tests, typecheck, and build; run measurement request
   rspec if backend changes prove necessary. verify browser behavior where the
   local browser runtime is available.
5. update the existing measurement-card-actions notes and project overview with
   the verified cause and validation results.

## schema, api, ux, and hardware

no schema or hardware changes are intended. preserve the existing clear_data
patch contract. the ux should show confirmation and pending/error state, then
remove cleared history immediately without changing selection.

## regression cases

- confirm clear with a nonempty visible graph; store receives clear_data and
  successful completion empties history before accepting refreshed data.
- canceled confirmation sends no mutation and keeps history.
- failed clear exposes an error and keeps history.
- pre-clear in-flight responses cannot restore erased history.
- pointer, keyboard, and focus dismissal do not swallow the clear action.
- new samples after clearing can graph normally.

## environment

mise currently crashes resolving the toolchain on this mac. frontend checks
can use the installed node 22 executable directly. configured ruby 4.0.9 is
not installed locally; ruby 4.0.2 is available. initial rspec launch did not run.

## verified cause and fix

safari can blur a focused menu button to the document during a pointer press,
before dispatching click. the card's blur handler unmounted the menu, swallowing
the click. retain the menu during a pointer press inside the open card; clear
that guard on pointerup/pointercancel. keyboard focus departure and outside
pointer dismissal retain their existing behavior. applies to clear and delete.

actual safari verification on http://127.0.0.1:5174 reproduced the failure
before the patch, then confirmed that pointer activation opens confirmation
after the patch. canceled both keyboard and pointer confirmations; no live
history was erased. the temporary development tab was closed.

frontend integration coverage uses mocked HTTP through the real store and
checks populated graph -> confirmed patch -> empty graph. backend code, schema,
and hardware are unchanged. rspec was attempted using installed ruby 4.0.2,
but database socket access was denied by the sandbox before any examples ran.

## validation

- 125 frontend tests across 18 files passed; typecheck and production build passed.
- pointer regression uses the real element blur inside act, and also checks
  keyboard focus departure after pointerup. reverting the blur guard makes
  this test fail because the clear menu item disappears; restoring it passes.
- browser verification reproduced the pointer failure before the fix and
  verified confirmation after the fix. confirmations were canceled.
- no production deployment, commit, hardware writes, or real history deletion.
