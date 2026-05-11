# Output Enable

## Design

Add first-class `OutputBlock`s owned by a `LogicDiagram`. Each output evaluates one expression, points at one binary relay output on a device, and records a desired output value in trace `data`.

The poller applies latest enabled output values after reading each device. Hardware writes only happen when both `LogicDiagram#output_enable` and `OutputBlock#output_enable` are true. Disabled outputs do not write anything, leaving the physical relay unchanged.

For the N4D8B08 relay board, a truthy OutputBlock value maps to the driver's `open(channel)` command. Per the board manual, "open" energizes the relay and connects NO to COM; falsey maps to `close(channel)`.

## Implementation Plan

1. Add backend persistence for diagram-level `output_enable` and diagram-owned `OutputBlock` records.
2. Add `OutputBlock` validations mirroring measurement/logic-block naming and validating writable binary device channels.
3. Add an output evaluator after measurements and logic blocks. It records a `Datum` for every output and delegates allowed physical writes to a small writer service.
4. Add REST API/controller/routes for `output_blocks`, expose `output_enable` through `LogicDiagramApi`, and expound output records with diagrams.
5. Add frontend store types, load output blocks, add diagram-level and per-output enable toggles, and replace the output placeholder with output cards/forms.
6. Add RSpec coverage for model/API/evaluation/write behavior and run backend/frontend verification.

## Confirmation

Confirmed by user request: "PLEASE IMPLEMENT THIS PLAN".
