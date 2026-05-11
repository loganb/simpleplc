# N4D8B08 Input Mode

## Design

The N4D8B08 relay I/O board ships with its digital inputs coupled to relay outputs in self-locking mode. For this app, relay outputs should be controlled by application logic instead of physical input highs toggling matching relay channels.

Configure the board to use unrelated input/output mode during `Drivers::N4D8B08` initialization. This keeps `read` focused on state acquisition while making every poller-created driver instance write the desired board configuration before the board is used.

Existing relay output states should be left unchanged. Initialization only writes the input/output relationship register.

## Implementation Plan

1. Add driver specs for `Drivers::N4D8B08`.
2. Red test: initializing the driver writes `0x0000` to relationship register `0x00FD`.
3. Confirm `read` continues to return output/input booleans from the existing channel registers.
4. Confirm output command methods write only their command registers after initialization.
5. Add relationship register and unrelated-mode constants to the driver.
6. Override `initialize(device, slave)`, call `super`, then write unrelated mode to the relationship register.
7. Update `claude/overview.md` with the driver initialization behavior.
8. Run focused RSpec for the driver.

## Confirmation

Confirmed with the user before implementation:

- Task note name: `n4d8b08-input-mode`.
- Configuration should be written every time an N4D8B08 driver instance is initialized.
- Existing relay output states should be left as-is.
