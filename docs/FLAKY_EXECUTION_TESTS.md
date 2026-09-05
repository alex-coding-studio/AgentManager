# Flaky Card lifecycle in the Development Execution tests

Status: reported, not diagnosed. Remove this document when the cause is fixed.

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

## Hypothesis, not verified

Some Card work started by the test body is not awaited before the test returns. Both signatures follow from that: an unawaited Card is still marked running when the next assertion reads it, and an unawaited write lands during teardown. The execution service is created per test through `createExecutionService`, so the handle a test would need to await may exist already, or may need to be exposed.

I did not diagnose which call is unawaited, and I did not attempt a fix.

## What I checked and ruled out

- The fixed Card UUID `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa` appears once in the file, so this is not state leaking between tests through a reused identifier. I initially suspected this and it is wrong.
- Each test gets its own `mkdtemp` root, so the shared directory theory does not hold either.
- The failures are not confined to one test, so this is not a single incorrect assertion.

## Suggested direction

Make the tests await the real settle signal. Please do not paper over it with a sleep, a retry, or a longer timeout, and do not weaken an assertion: the failure is telling us that a caller can observe a Card mid-write, which may matter outside the tests too.

One practical consequence in the meantime: the full chain uses `&&`, so this failure aborts every later script and makes an otherwise green run look like a broad breakage.
