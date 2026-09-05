# Flaky Card lifecycle in the Development Execution tests

Status: cause identified, fix incomplete. Remove this document when the suite is stable.

`tests/just-do-it-execution.test.ts` fails intermittently. Three different tests in that file have failed with two distinct signatures, all pointing at a Card's background work still running when the next assertion or the fixture teardown starts.

Observed while delivering unrelated materialization work on branches that changed no file under `lib/modules/implementation/`.

## Measured rate

| How it is run                                                                               | Failures |
| ------------------------------------------------------------------------------------------- | -------- |
| The file alone, `node --experimental-strip-types --test tests/just-do-it-execution.test.ts` | 1 of 8   |
| The suite, `npm run test:implementation-execution` (7 files, 122 tests)                     | 3 of 22  |
| The full chain, `npm test`                                                                  | 2 of 3   |
| CI, run 33986130044                                                                         | 1 of 1   |

The file fails on its own as well as inside the suite, so running several files together is not the cause. The full chain fails more often than either, which is consistent with machine load widening the window, but the samples are small and I am not claiming that as the mechanism.

An earlier revision of this document reported 0 failures in 2 isolated runs and concluded the file passed in isolation. Six further runs produced one failure. Two samples did not support that claim, and the corrected figure matters: a debugger can reproduce this against the single file and does not need the whole suite.

## Reproduction

```bash
cd /path/to/Praxis
for i in $(seq 30); do
  npm run test:implementation-execution 2>&1 | grep -E "^✖ [a-z]|ENOTEMPTY|Wait for this Card" | head -2
done
```

At roughly 14 percent per run, 30 iterations should produce about four failures. The same loop against the single file reproduces it at roughly 1 in 8, which is the cheaper starting point.

## Captured signatures

**1. A Card is still running when the next assertion executes.**

Test: `unsupported app bundle retries stop before workspace and remote verification`, near line 1496.

```
AssertionError: The input did not match the regular expression /unsupported.*Retrying cannot/.
Input: 'PublicApiError: Wait for this Card to finish before rechecking.'
```

**2. Something is still writing into the Card directory during teardown.**

Tests: `host preserves worker checklist when coordination recovery fails` near line 1771, and `accepted reports with artifact warnings are handed to the next Action with their original evidence`.

```
[Error: ENOTEMPTY: directory not empty, rmdir
 '/var/folders/.../jdi-execution-test-XXXXXX/.praxis/implementation/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']
{ errno: -66, code: 'ENOTEMPTY', syscall: 'rmdir' }
```

The fixture teardown is `t.after(() => rm(rootPath, { recursive: true, force: true }))` at line 54. `force: true` suppresses ENOENT but not ENOTEMPTY, and ENOTEMPTY is what you get when a file appears between the directory read and the `rmdir`. So the failure means a write landed after teardown began.

## Identified cause

The fixture helper `settled()` returns as soon as the persisted last Run is no longer `running`. In `execution-service.finish()` that terminal Run is committed **before** `settleRun` publishes the terminal Latest Response, closes the Run Log and releases the observability reservation, and before the outer `finally` removes the Card from the execution service's own active map.

Both signatures follow from that ordering:

- `recheckOutput` runs while the service active map still owns the Card, so the production guard correctly answers `Wait for this Card to finish before rechecking`;
- teardown removes the Card directory while Latest Response or log finalization is still writing, producing `ENOTEMPTY`.

This is a fixture settlement bug. The production service deliberately refuses follow-up operations during the finalization window, so the guard message is correct behavior, not a defect.

Waiting on the observability reservation's `released` promise is not sufficient: `releaseRun` resolves it inside `settleRun`, which is before `finish` reaches its active-map cleanup.

## The obvious fix is not sufficient on its own

Each fixture now keeps the active map it passes to `createExecutionService`, and `settled()` requires both a terminal persisted Run and release of the Card from that map.

A first attempt queried that map with the bare Card UUID while the service stores entries under `card:${path.resolve(project.planningPath)}:${cardId}`, so the added condition was always false and the measurement that followed it tested the unchanged code. That is corrected; the helper now builds the service key.

With the correct key the condition genuinely applies, and the failure still occurs: `host preserves worker checklist when coordination recovery fails` failed on the third of a fresh run series. So the ordering above is real and necessary but not sufficient, and this is now a measured result rather than an artifact of a broken experiment.

Whoever continues should start from this partial fix rather than repeat it, and should measure over at least 15 runs before calling it fixed. One green run proves nothing at a 14 percent rate.

## The suite has no test timeout

`test:implementation-execution` does not pass `--test-timeout`, and node:test waits indefinitely by default. The same defect therefore appears in two forms: a named failure when a timeout is set, and a process that never exits when one is not. Two runs of the measurement loop hung for minutes with no output until they were killed; adding `--test-timeout=30000` turned that into an ordinary reported failure.

Four concurrency-sensitive suites in `package.json` already set `--test-timeout=20000`. This suite, which drives real Card execution, does not. Adding one would not fix the race, but it would stop a hang from stalling the whole chain silently.

## What I checked and ruled out

- The fixed Card UUID `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa` appears once in the file, so this is not state leaking between tests through a reused identifier. I initially suspected this and it is wrong.
- Each test gets its own `mkdtemp` root, so the shared directory theory does not hold either.
- The failures are not confined to one test, so this is not a single incorrect assertion.

## Suggested direction

Make the fixture await the real settle signal. Do not paper over it with a sleep, a retry, or a longer timeout, and do not weaken an assertion.

An earlier revision of this document suggested the failure might indicate a production problem, that a caller could observe a Card mid-write. That was wrong: the production guard exists precisely to refuse work during that window, and the tests were reading through it.

One practical consequence in the meantime: the full chain uses `&&`, so this failure aborts every later script and makes an otherwise green run look like a broad breakage.
