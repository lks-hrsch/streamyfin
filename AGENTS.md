# AGENTS.md

Instructions for any coding agent working in this repository (Claude Code, Codex, Copilot
and the like). [CLAUDE.md](CLAUDE.md) is the index of conventions and learned facts; read it
first. This file holds what every agent has to do on top of it.

## Pull requests are reviewed by hand

The maintainer reads every PR himself, the diff and the description, and judges UI changes
from the images in the PR, not from a build he runs. A PR is ready for review only when he
can do that without checking it out. The rest of the flow is in
[contributing-flow.md](docs/conventions/contributing-flow.md).

- **Before and after screenshots for every UI change**, on every platform the change
  reaches: iPhone, Apple TV, Android, Android TV, the Mac. The same screen with the same data
  in the same state, side by side in a table, one row per platform. For a fix, "before" shows
  the bug.
- **A short video or GIF** for anything animated, for focus movement on TV, and for any flow
  longer than one screen.
- **A caption per image** that says what to look at, not just which screen it is.
- **Evidence for changes without a visible surface** (a request, a stored value, a log
  line): the trace or log excerpt before and after, instead of a screenshot.
- **No personal data in images**: use a test server and test account. No access tokens,
  server addresses, account names or a private library; crop or blur what cannot be avoided.
- **Capturing**:
  - iOS and tvOS simulator: `xcrun simctl io <udid> screenshot <file>`
  - Mac: `screencapture -o -l <window id> <file>` (the app's window only, never the screen)
  - Android and Android TV: `adb exec-out screencap -p > <file>`
- **Attaching**: the images belong in the PR description, not links to local files. Without
  a browser to drop them into GitHub's editor, push them to a branch of your fork that holds
  only these assets (for example `pr-assets/<branch>`) and link them from there, so they never
  enter the code history.
- **Updating a PR**: new images for whatever the update changed, and a comment that says what
  changed since the last review.
