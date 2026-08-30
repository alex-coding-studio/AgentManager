# Appearance

Settings provides Light, Dark, and Follow system appearance. New and legacy
settings without an appearance preference default to Follow system. Explicit
Light or Dark overrides the device preference; Follow system responds to changes
while the page is open.

Appearance is saved beside language in the application's local `settings.json`.
Partial writes preserve the other preference and are serialized within the local
process. No project files, generated content, Harnesses, or Agent settings change.

The root layout renders an explicit dark preference immediately. A small fixed
head script resolves Follow system before the page body is painted; the client
provider maintains the preference and media-query subscription after hydration.
It does not inject user content into executable scripts or read browser storage.

Semantic theme tokens cover pages, navigation, cards, Markdown readers, dialogs,
native controls, and graph controls. Graph Candidate, running, dependency, and
error colors have brighter dark-mode variants so their meaning stays legible.
The palette remains neutral apart from these existing state indicators.

Tests cover default migration, persistence, concurrent language/theme updates,
invalid values, explicit overrides, and pre-hydration theme resolution. Browser
checks cover the settings controls, system media changes, reload persistence,
canvas colors/edges, and reader/dialog interaction.
