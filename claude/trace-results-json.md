# trace-results-json

## Design

Trace is the durable computation snapshot for a LogicDiagram. Instead of writing one polymorphic Datum row per measurement, logic block, and output block, a Trace stores a single JSON `results` document.

The `results` document is schema-versioned and grouped into typed, ID-keyed buckets:

```json
{
  "schema_version": 1,
  "measurements": {
    "12": {
      "id": 12,
      "name": "BoilerOutletTemp",
      "value": 145.0,
      "state": { "mode": "simulation" },
      "input_values": {},
      "recorded_at": "2026-05-11T..."
    }
  },
  "logic_blocks": {
    "34": {
      "id": 34,
      "name": "BOT_Ready",
      "type": "HysteresisLogicBlock",
      "value": 1.0,
      "state": { "output": true },
      "input_values": { "value": 145.0 },
      "recorded_at": "2026-05-11T..."
    }
  },
  "output_blocks": {
    "56": {
      "id": 56,
      "name": "Boiler_Enable",
      "value": 1.0,
      "state": {
        "desired_output": true,
        "effective_output": null,
        "diagram_output_enable": false,
        "output_enable": false,
        "write_pending": false,
        "write_skipped_reason": "diagram_output_disabled"
      },
      "input_values": { "input": 1.0 },
      "recorded_at": "2026-05-11T..."
    }
  }
}
```

Stringified IDs avoid collisions inside JSON object keys, while names and types are snapshotted for debugging and tolerance across later renames. Existing diagram input Measurement records remain configuration objects. Historical time-series measurement extraction is explicitly deferred.

## Implementation Plan

1. Add `traces.results` as a non-null JSON column with `{}` default and remove the polymorphic `data` table.
2. Remove Datum model/API/controller/routes and frontend Datum model usage.
3. Refactor trace computation so TraceEvaluator builds the complete `results` hash in memory and persists it once inside the trace transaction.
4. Refactor EvaluationContext, BlockEvaluator, and OutputEvaluator to read/write result hashes instead of Datum rows.
5. Add Trace result lookup helpers and latest-trace helpers for Measurement, LogicBlock, OutputBlock, APIs, and OutputWriter.
6. Update backend and frontend tests to assert JSON-backed trace results and no expounded Datum payloads.
7. Update `claude/overview.md` after implementation.

## Confirmation

User explicitly asked: "PLEASE IMPLEMENT THIS PLAN" on 2026-05-11 after the Plan Mode design was discussed and confirmed.
