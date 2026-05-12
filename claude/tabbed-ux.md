# tabbed-ux

## Design

Split the frontend into three top-level tabs:

1. **Dashboard**: monitoring-only view.
   - Render the current device state the way the existing dashboard does now.
   - Add one summary block per logic diagram.
   - Each logic diagram summary shows just the diagram's input measurement values and output values. It should avoid block editing and detailed expression controls.
   - Keep operational controls that affect live state if useful, such as "Compute Now" and output-enable toggles, only if they still feel like dashboard actions rather than editing.

2. **Devices**: configuration view for host interfaces and devices.
   - Manage host interfaces.
   - Manage devices.
   - Show enough current state on device rows/cards to keep edits grounded, but editing and create/delete belong here.
   - Current code has read-only device cards and no frontend host-interface/device forms, so this tab likely needs new forms and CRUD wiring for both models.

3. **Logic**: configuration view for logic diagrams.
   - Move diagram selection, diagram create/delete, measurements, logic blocks, output blocks, and diagram layout/editor behavior here.
   - This is where editing functionality for logic diagrams lives.

The tabs should use `TreeStore` as the UI state spine. `App` owns a root UX tree, uses the root active subtree as the selected tab, and passes only the relevant child subtree into each tab component:

- `DashboardTab` receives `ux.subtree('dashboard')`.
- `DevicesTab` receives `ux.subtree('devices')`.
- `LogicTab` receives `ux.subtree('logic')`.

Those subtrees may start mostly empty, but the prop boundary matters. Tab-local selections, open forms, edit IDs, and future filters should live in the relevant subtree instead of accumulating as top-level `App` state.

The file tree should make the tab boundary real:

```text
frontend/src/
  App.tsx
  uxTree.ts
  tabs/
    dashboard/
      DashboardTab.tsx
      DashboardLogicSummary.tsx
      DeviceStateCard.tsx
    devices/
      DevicesTab.tsx
      DeviceForm.tsx
      HostInterfaceForm.tsx
    logic/
      LogicTab.tsx
      LogicDiagramEditor.tsx
      LogicDiagramForm.tsx
      LogicBlockForm.tsx
      MeasurementForm.tsx
      OutputBlockForm.tsx
```

Exact filenames can shift if a smaller split is cleaner, but each tab gets its own directory and owns its internal components. Shared formatting helpers can move to `frontend/src/components/` or `frontend/src/format.ts` only when more than one tab actually uses them.

The simplest good behavior is:

- Default to Dashboard.
- Keep selected tab in the root `TreeStore` active subtree, so the URL hash can restore it.
- Keep current refresh/cache-epoch behavior so all tabs see fresh data after writes.
- Break the current unwieldy `App.tsx` into tab directories rather than only creating inline subcomponents.

Open question for confirmation: should Dashboard include "Compute Now" and output-enable toggles, or should it be strictly read-only monitoring?

## Implementation Plan

1. Red phase: add focused frontend tests around the new tab UX.
   - Verify the app exposes Dashboard, Devices, and Logic tabs.
   - Verify Dashboard renders device state and logic diagram summaries without edit buttons/forms.
   - Verify Logic contains existing diagram editing controls.
   - Verify Devices contains host-interface/device management controls.

2. Add the UX tree definition and tab shell.
   - Create `frontend/src/uxTree.ts` with a typed root tree whose pages are `dashboard`, `devices`, and `logic`.
   - Instantiate `TreeStore` in `App` and use `rootUx.getActiveSubtree()` / `rootUx.setActiveSubtree()` for tab selection.
   - Pass `rootUx.subtree('dashboard')`, `rootUx.subtree('devices')`, and `rootUx.subtree('logic')` into their respective tab components.
   - Keep any remaining top-level state limited to cross-tab data loading and refresh mechanics.

3. Refactor `frontend/src/App.tsx` into one directory per tab.
   - Create `frontend/src/tabs/dashboard/`, `frontend/src/tabs/devices/`, and `frontend/src/tabs/logic/`.
   - Move the current device card grid into `tabs/dashboard/DashboardTab.tsx`.
   - Move the current logic diagram editor into `tabs/logic/LogicTab.tsx`, preserving existing behavior.
   - Keep component state inside the tab subtree where practical: selected diagram, open forms, edit IDs, and similar state should not stay in `App`.

4. Build Dashboard logic summaries.
   - For each loaded logic diagram, collect measurements and output blocks by `logic_diagram_id`.
   - Display measurement names with latest/simulation values and units.
   - Display output names with desired/effective values and enabled state.
   - Keep the visual density closer to a control dashboard than a marketing page.

5. Build Devices management.
   - Add host-interface list and form with create/edit/delete.
   - Add device list and form with create/edit/delete.
   - Use existing `Store.m(HostInterface)` and `Store.m(Device)` APIs.
   - Preserve current device-state rendering for quick inspection.
   - Put Devices tab edit IDs and open-form state in the Devices subtree, even if some values are initially simple strings/numbers.

6. Tighten editing placement.
   - Remove edit/create controls from Dashboard.
   - Ensure measurement, block, output, and diagram edit controls only appear in Logic.
   - Ensure host-interface/device edit controls only appear in Devices.

7. Verification.
   - Run frontend tests with Vitest.
   - Run relevant RSpec request/model tests only if backend API behavior changes; otherwise frontend tests are the main red-green loop.
   - Build the frontend and, if the dev server is available, inspect the app in-browser for layout and tab behavior.

## Notes

- Existing worktree is dirty before this task started. Avoid touching unrelated migration/config/note changes.
- `claude/overview.md` says the current frontend dashboard combines device cards, measurement cards, CRUD forms, and the logic diagram editor in `frontend/src/App.tsx`.
- Implemented with `frontend/src/App.tsx` as the data-loading tab shell, `frontend/src/uxTree.ts` as the typed UI state tree, and one tab directory each for Dashboard, Devices, and Logic.
- Dashboard is monitoring-only in this pass. Operational/editing controls live in Devices or Logic.
- Devices management required enabling create/update/destroy in `DeviceApi` and `HostInterfaceApi`.
- Browser verification was not completed because the sandbox blocked binding the frontend dev server port and escalation was rejected.
