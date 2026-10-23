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
- **A caption per image** that says what to look at, not just which screen it is. Write it
  after looking at the image, not from memory of what the screen should show.
- **Only real evidence in the description**: a trace or log excerpt is copied from the actual
  output, never reconstructed or "illustrative", and a claim about the test data matches what
  the server holds. A reviewer trusts the description first; one invented line costs that
  trust for the whole PR.
- **Evidence for changes without a visible surface** (a request, a stored value, a log
  line): the trace or log excerpt before and after, instead of a screenshot.
- **No personal data in images**: with the test server that follows by itself. Check anyway
  that no access token, personal server address, account name or private library is in
  view.
- **Capturing**:
  - iPhone, iPad and Apple TV simulators: `xcrun simctl io <udid> screenshot <file>`. One
    build serves iPhone and iPad (`supportsTablet`); Apple TV needs the TV prebuild.
  - Mac: `screencapture -o -l <window id> <file>` (the app's window only, never the screen).
    Build screenshot apps with their own bundle identifier: every build with the same one
    shares one sandbox container, so a screenshot build would open signed in to whatever
    real account the developer's own build uses.
  - Android and Android TV: `adb exec-out screencap -p > <file>`
- **Before and after without rebuilding**: when the branch changes no native code (nothing
  under `ios/`, `android/`, `modules/`, `plugins/`, `patches/`, `app.json`, `app.config.ts`,
  `package.json`), one dev build per platform serves both sides. Run Metro from a `develop`
  worktree for "before" and from the branch's worktree for "after", reloading the app in
  between. Deep links reach the screens directly: `streamyfin://series/<id>`,
  `streamyfin://items/page?id=<id>`, `streamyfin://persons/<id>`,
  `streamyfin://collections/<id>`, `streamyfin:///(search)`. Turn off the dev menu's tools
  button and element inspector first, or they end up in every image.
- **Attaching**: the images belong in the PR description, not links to local files. Without
  a browser to drop them into GitHub's editor, push them to the `pr-assets` branch of this
  repository, one folder per PR (`pr-<number>/`), and link them from there. It is an orphan
  branch that holds only these images, so they never enter the code history. Without push
  access here, use a branch of your fork the same way.
- **Updating a PR**: new images for whatever the update changed, and a comment that says what
  changed since the last review.

## Testing locally

- **Debug build, not Release.** Run the app as a dev build against Metro (`bun run start`,
  then open `exp+streamyfin://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081` on
  the device or simulator) whenever a change is tested or a bug is chased locally.
- **Find the cause in logs and traces, do not guess it from screenshots.** Metro's terminal
  carries the JS console, the app's own log (Settings → Logs) carries what the services
  wrote, and a failed Seerr request logs its response body there. When neither shows the
  path in question, add a temporary log line at the decision point, reproduce, read it, and
  remove it before committing. The empty Seerr Discover that started this rule was a
  `401 cookie 'connect.sid' required` that no screenshot showed.
- **Mac Catalyst**: read `.claude/learned-facts/mac-catalyst-build.md` (it comes with the
  Mac build) before touching anything in the header, a modal or a SwiftUI menu. In a dev
  build the dev launcher's tab bar takes over the window toolbar, so reach the app's own
  screens through deep links there.

## Dependencies

- **Install with the Bun version CI pins** (`bun-version` in
  `.github/workflows/check-lockfile.yml`), not whatever Bun is installed locally:
  `bunx bun@<that version> install --frozen-lockfile`. Another version rewrites `bun.lock`,
  downgrading its format or bumping transitive packages, and that rewrite does not belong in
  a PR.
- **A lockfile change is made on purpose or not at all.** Before committing one, check it
  with `bunx bun@<CI version> install --frozen-lockfile --dry-run --ignore-scripts` and
  `bun scripts/check-patched-deps.ts`, the two steps the lockfile job runs.

## Keeping open PRs mergeable

- **When `develop` moves, rebase every open PR of yours onto it** and run the gate again, so
  the maintainer never meets a conflict.
- **Check open PRs against each other, not only against `develop`.** Two PRs can each merge
  cleanly and still collide with one another, for example when both append a test at the end
  of the same file. Check every pair with
  `git merge-tree --write-tree --name-only <pr-a> <pr-b>`, and fix a collision on your side
  before it reaches the maintainer.
