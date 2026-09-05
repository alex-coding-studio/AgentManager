# Praxis desktop trial

A thin Electron shell around the existing local Praxis server. The renderer has no Node access, preload bridge or webview. Navigation stays on the configured loopback origin; HTTPS links open in the system browser. Existing task logs remain the source of notification state.

## Run locally

Use Node 26 and install the web repository dependencies first, then:

```sh
npm --prefix desktop ci
npm run desktop
```

The launcher records this checkout and the Node executable in the local `PRAXIS_HOME/desktop/config.json` (default home: `~/.praxis`). No machine paths enter Git. The default port is 3101, with development mode for this trial. `PRAXIS_DESKTOP_ROOT`, `PRAXIS_DESKTOP_PORT` and `PRAXIS_DESKTOP_MODE=start` override those choices. Production mode requires a prior web build.

The app connects to an existing CLI-managed server on that port, or starts one through `praxis dev -d --lan`. It does not replace the CLI's process identity or LAN-origin handling.

## Lifecycle

- Closing the window leaves the tray and tasks alive. Open Praxis from the tray or Dock to return to the last page.
- The tray distinguishes an existing server from a desktop-managed server. Quitting leaves an existing server running.
- Quitting a desktop-managed server stops it through the CLI only when the recorded process identity still matches. If any latest response is running, finish or cancel that task in the web UI first. Unreadable status prevents shutdown.
- No launch-at-login registration, automatic task cancellation, or force termination is installed.
- Task completion, warning and failure produce native notifications. Existing terminal results are silent at startup, user cancellation is silent, and each owner/run notifies at most once while the app stays open. Clicking a notification opens its log. OS notification settings and Focus mode still apply.

## Local app bundle

```sh
npm run desktop:package
```

The bundle appears under `dist/desktop/`. It uses the local configuration created by the launcher and still depends on that checkout and its installed Node runtime. This is an unsigned local trial, not a self-contained installer or a signed distribution. macOS is the initial validation platform; Windows/Linux code paths are not yet manually validated.

## Verification

`npm run test:desktop` checks notification transitions, link confinement, service ownership and response discovery without running Agents. Native smoke checks cover window close/reopen, menu-bar residency and connecting without changing an existing server PID. Do not manufacture task failures to test notifications.
