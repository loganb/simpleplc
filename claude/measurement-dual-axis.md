# Measurement dual axis

## Agreed design

The Measurements graph has left and right numeric axes on the same time plot. Each measurement starts on the left. An always-visible ← or → button in the upper right of each card, beside its actions menu, shows the current assignment. Clicking, tapping, or activating it with the keyboard moves the measurement to the other side. Selection and axis assignment are independent, so a hidden measurement can be assigned a side before it is shown again.

Each axis fits the visible numeric history assigned to it, using the existing IQR rules. The existing full-range checkbox applies to both axes, each with its own range. An axis without numeric history has no tick labels. Boolean history continues to shade the full plot height and contributes no numeric bounds, including when a measurement has both numeric and boolean history. The legend shows the side beside each series name so the assignment is visible while reading the graph.

## Implementation plan

1. Add failing Vitest coverage in `MeasurementsTab.test.tsx` for toggling the arrow without changing selection, assigning a deselected measurement, and keeping the assignment across remounts. In the graph tests, use a small numeric series and a much larger one to establish independent bounds and axis-specific clipping. Cover a right-axis raw line, bucket mean and band, and both kinds of off-scale markers with the existing ECharts test harnesses.
2. Add `rightAxisIds: number[]` to `MeasurementsUXTree` in `frontend/src/uxTree.ts`, defaulting to an empty list when the field is absent. Read and write it through the existing `TreeStore`, keeping assignments with range and selection across tab changes and in the URL fragment. Pass a typed `left` or `right` assignment on the graph series and include it in the tab's memoization key. Keep measurement IDs and the history request inputs independent from axis state.
3. In `MeasurementsTab.tsx`, place a native button alongside the existing card controls with enough room for touch targets and long names. Give it an accessible name that includes the measurement and current side and exposes the result of activating it. Keep it a sibling of the selection button and the actions menu. Preserve the existing menu focus behavior.
4. In `MeasurementHistoryGraph.tsx`, partition transformed series by assignment for range analysis and clipping. Reuse `analyzeHistoryRange` and `historyClipping` for each group. Use the assigned domain for the cursor's off-scale text and highlight eligibility. Set the ECharts `yAxisIndex` for numeric lines, bands and markers. Keep a left and a right axis on the same grid even when one is hidden, with a finite fallback domain for custom rendering. Draw any horizontal grid lines from one visible axis. Give the chart room for both sets of tick labels at desktop and phone sizes. Use the same grid margins to report plotting width on mount and resize, so moving a series doesn't change the history point budget. Keep existing cursor restoration and full-height boolean shading.
5. Run the targeted frontend specs through red and green, then the frontend suite, TypeScript check and production build. Use the real ECharts SVG tests at desktop and phone widths to verify geometry and labels. If running a Playwright check, use fixture data without starting a poller or using production. After verification, update `claude/overview.md` with the implemented behavior.

## Interfaces

- **Schema and server API:** No changes. Axis assignments are frontend URL-tree state and do not write to measurement records or change history queries.
- **UX state:** Existing URLs without `rightAxisIds` plot everything on the left. Storing only right-side IDs gives new measurements the same default. The assignment applies to all numeric history for the measurement, including after a source change.
- **Hardware:** No changes to recording, polling, or relay I/O.

## Verification cases

- The arrow defaults left, toggles in both directions, and preserves selection and the existing card menu behavior. A right assignment survives deselecting, reselecting, and leaving and returning to Measurements.
- Numeric series with different magnitudes are readable together on independent scales. Moving one series updates both domains, including when one side becomes empty. Boolean-only and no-data graphs render without numeric labels.
- A value covered by the other axis still clips on its own. Right-axis raw and summary markers and the cursor readout agree. The full-range checkbox clears the clipping and expands each relevant scale independently.
- Right-axis lines, bucket bands and markers render with finite coordinates. A shared time cursor continues to highlight in-range values. Check margins and card control spacing at phone and desktop widths.

These behaviors live in the frontend. Use Vitest for the new coverage. Existing measurement RSpec tests continue to cover the server contract.

## Results

- All 138 frontend tests, TypeScript checking, and the production build passed. The real ECharts SVG tests cover both kinds of right-axis clipping markers and the numeric series that use them.
- Offline Playwright checks with fixture data passed at 1100px and 390px. They covered both scales, a right-only plot, selection, click and tap, keyboard activation, URL persistence, and the absence of a history request when only the axis changes.
