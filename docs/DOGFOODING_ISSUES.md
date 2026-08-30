# Dogfooding issues

Record UI findings here while the HereItIsV2 trial focuses on Agent output.
GitHub Issues is currently disabled for this repository. Recording a finding
does not authorize implementation or changing the live trial's Harness.

## Hide the origin add control during downstream generation

- Reported: 2026-08-30, initial What's Next generation in HereItIsV2.
- Status: recorded; fix deferred until after the output-evaluation round.
- Observed: the origin Card still displays its plus button while the connected
  right-hand placeholder shows an active Codex run.
- Expected: hide that origin's add/expand control while its generation is running
  or validating. Keep the running placeholder's cancel action available.
- Restore the origin control after success, failure, or cancellation when no
  associated generation remains active. Unrelated Nodes remain usable.
- Preserve Card geometry and connection endpoints while hiding the control.
- When implementing, check other consumers of the shared graph Card for the
  same interaction; do not treat that as authorization to change them now.
- User evidence: `Snapzy_2026-08-30_16-04-46_697.png`.
