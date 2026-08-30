# Markdown Reading and Annotations

The shared Markdown reader opens in reading mode. Native text selection does not
offer feedback actions until the user enables annotations with the header icon.
The toggle exposes its pressed state and returns to off when another document or
revision opens. Readers without a feedback callback never show annotation tools.

In annotation mode, a completed selection offers **Add feedback** beside the
visible selection, including selections spanning multiple lines. The toolbar is
not shown while the mouse is dragging. It stays inside the reader's visible
bounds, moves with scrolling, and disappears when its selection leaves view.
Near the bottom, it appears above the selected text rather than outside the page.
Paragraph-level feedback buttons are also available only in annotation mode.

Adding feedback retains the existing source-line and excerpt contract. It opens
the consuming feature's feedback editor without requiring a scroll to the document
header. Selecting text does not submit feedback or start an Agent request.

The Markdown component mapping remains stable while selection state changes so
native ranges are not detached by remounting paragraphs. The shared positioning
helper has geometry tests; browser verification covers reading mode, opt-in mode,
mouse drag completion, and the feedback editor.
