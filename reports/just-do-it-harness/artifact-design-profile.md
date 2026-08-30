# Artifact profile: Card handoff

Reader: a replacement Agent locating the current work, not a user reading a
complete transcript. Format: a short Markdown main document, a compact index,
and immutable per-record references. No screenshots or decorative report UI.

Main hierarchy: Card identity and context revision; current state and summary
coverage; a few recent references grouped by stage; a full-index entrance.
Detailed user wording and execution events belong in references. Artifact
content remains in its PR or original location rather than duplicated locally.

Checks: the main document must not inline a long original input; all original
content must remain readable through a reference; newer facts must not be hidden
by an older summary; links must retain Card/revision identity. Existing fixed
tests exercise these properties. Real Agent reading behavior is missing evidence.
