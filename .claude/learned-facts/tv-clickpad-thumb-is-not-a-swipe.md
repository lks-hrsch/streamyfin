# A Thumb on the Siri Remote's Clickpad Is Not a Swipe

**Date**: 2026-11-12
**Category**: native-modules
**Key files**: `modules/mpv-player/ios/NativePlayer/TVRemotePanGate.swift`, `modules/mpv-player/ios/NativePlayer/NativePlayerViewController.swift`, `tests/native/TVRemotePanGateTests.swift`, `scripts/ios/test-tv-remote-pan.sh`

## Detail

The Apple TV player's recognizer mode (zone `.none`: chrome hidden, or a scrub armed) has a `UIPanGestureRecognizer` on the clickpad. It begins after a few points of movement, and a thumb produces that without any intent to swipe: it rests on the clickpad between presses, trembles, rolls as it clicks the centre (the pad flattens before the switch goes down), and slides to the ring's edge for a directional click. Until the fix, `.began` armed a scrub on the first horizontally leaning movement. Arming pauses and shows the trickplay bar, the roll moved the target with velocity acceleration, and the press the thumb was making committed it: Play/Pause runs `endScrub` plus `requestPlaying(true)` on an armed scrub, Select runs `endScrub`. Pausing therefore jumped seconds to a minute and played on.

Every pan now goes through `TVRemotePanGate`. A pan travels a dead zone (`deadZonePoints`, net movement on one axis, so a tremble never adds up) before it arms a scrub or summons the chrome; an already armed scrub takes no dead zone. The controller overrides `pressesBegan`/`pressesEnded`/`pressesCancelled` and reports every remote press: a pan in progress stops there, a scrub that pan armed less than `pressGuardSeconds` before is cancelled without seeking (so Play/Pause pauses where the video was, a ring click skips), and a pan beginning that soon after a press does nothing.

Two things were reasoned, not measured, when this was written: that the clickpad maps to roughly the 1920pt screen (the dead zone's scale, read from the pan rate tuning), and that presses reach the view controller's `pressesBegan` in zone `.none` (they must pass its view for the press recognizers to fire at all). Each decision logs at info level as `remote pan: ...` under the `tvfocus` category (see `TVFocusLog` for the `log show` command): no `remote pan: stopped by a press` line on a click with a moving thumb means the press hook is not reached, and the dead zone is then the only guard.

The JS TV controls have no pan handling at all (swipes are ignored with the controls hidden), and Android TV remotes have no touch surface, so neither needs this.
