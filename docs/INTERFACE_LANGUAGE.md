# Interface Language

Global Settings provides English and Simplified Chinese interface options.
Settings is reachable from the project sidebar and project-list header, including
before any project exists. The default is English.

The preference is saved automatically to the application's `settings.json` beside
its project registry, under `PRAXIS_HOME` or the normal local application
configuration directory. It is not written to any project's planning directory.
Invalid language writes are rejected; a missing or malformed preference falls
back to English. Writes use atomic rename.

The root layout reads the saved language for server rendering. The client provider
uses that same value, then updates interface text and the document language after
a successful save. Refreshing or reopening the website retains the choice.

Only application-owned text uses the UI translation catalogue: navigation, settings,
forms, action labels, tooltips, graph controls and reader controls. Unknown UI
messages fall back to English. This is explicit component-level translation, not
a DOM replacement pass or an Agent translation request.

User text, project names, file names, node types supplied by Agents, Candidate
titles and summaries, Markdown bodies, JSON, and stored Resources remain verbatim.
Locale is not passed to the Harness, request packet, provider command or output
renderer. Output language remains controlled by the user's Agent instructions.

Verification covers preference persistence, unsupported values, safe fallback,
placeholder preservation, browser switching and refresh, interactive graph/reader
behavior, and unchanged project Markdown/JSON hashes during the language test.
