# AGENTS.md

Instructions for any coding agent working in this repository (Claude Code, Codex, Copilot
and the like). [CLAUDE.md](CLAUDE.md) is the index of conventions and learned facts; read it
first. This file holds what every agent has to do on top of it.

## Pull requests are reviewed by hand

The maintainer reads every PR himself, the diff and the description, and judges UI changes
from the images in the PR, not from a build he runs. A PR is ready for review only when he
can do that without checking it out. The rest of the flow is in
[contributing-flow.md](docs/conventions/contributing-flow.md).

- **Before and after screenshots for every UI change on iPhone, iPad, Apple TV (tvOS) and the
  Mac (macOS)**, all four every time, also when the change looks platform-neutral: layouts
  differ between them, and a reviewer cannot tell from the diff alone which of them it
  reaches. A change to Android-specific code (Kotlin, `*.android.tsx`) adds Android and
  Android TV. The same screen with the same data in the same state, side by side in a table,
  one row per platform. For a fix, "before" shows the bug.
- **Always the local test server, always its test user.** Screenshots, recordings and traces
  come from [`e2e/test-server`](e2e/test-server/README.md) (`python3 e2e/test-server/setup.py`),
  signed in as `streamyfin-test`. Never a personal or production server, never a real
  account, never the test server's admin, not even for one quick shot. Before and after come
  from the same server state, so the only difference in the images is the change. If a
  screen needs data the test server lacks, add it to `setup.py` in the same PR instead of
  using another server.
- **A short video or GIF** for anything animated, for focus movement on TV, and for any flow
  longer than one screen.
- **A caption per image** that says what to look at, not just which screen it is.
- **Evidence for changes without a visible surface** (a request, a stored value, a log
  line): the trace or log excerpt before and after, instead of a screenshot.
- **No personal data in images**: with the test server that follows by itself. Check anyway
  that no access token, personal server address, account name or private library is in
  view.
- **Capturing**:
  - iPhone, iPad and Apple TV simulators: `xcrun simctl io <udid> screenshot <file>`. One
    build serves iPhone and iPad (`supportsTablet`); Apple TV needs the TV prebuild.
  - Mac: `screencapture -o -l <window id> <file>` (the app's window only, never the screen)
  - Android and Android TV: `adb exec-out screencap -p > <file>`
- **Attaching**: the images belong in the PR description, not links to local files. Without
  a browser to drop them into GitHub's editor, push them to a branch of your fork that holds
  only these assets (for example `pr-assets/<branch>`) and link them from there, so they never
  enter the code history.
- **Updating a PR**: new images for whatever the update changed, and a comment that says what
  changed since the last review.
