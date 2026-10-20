# Mac Catalyst Build

**Date**: 2026-10-08
**Category**: build
**Key files**: `plugins/withMacCatalyst.ts`, `plugins/mac-catalyst/macEntitlements.ts`, `scripts/ios/mpvkit-catalyst.ts`, `scripts/ios/build-mac.ts`, `app.config.ts`, `packages/react-native-google-cast.ts`

## Detail

The native Mac app is the iOS target built for Mac Catalyst, opt-in through
`STREAMYFIN_MAC_CATALYST=1` (`bun run prebuild:mac`, then `bun run mac`). The regular iOS
and tvOS prebuilds never load the Mac plugin. Every fix below was a build or launch failure
first; they are not cosmetic:

- **MPVKit has no Catalyst slice.** `scripts/ios/mpvkit-catalyst.ts` derives one from the
  arm64 iOS slice by rewriting each object's platform (LC_BUILD_VERSION 2 → 6; the Rust
  objects' LC_VERSION_MIN_IPHONEOS becomes a same-sized LC_SOURCE_VERSION) and adds a stub for
  the five OpenGL ES symbols of mpv's iOS GL interop, which Catalyst lacks and the app never
  reaches (vo=avfoundation). Hence **Apple Silicon only** (`EXCLUDED_ARCHS[sdk=macosx*]`).
  The real fix is a `maccatalyst` slice in the streamyfin/MPVKit release.
- **Pods need `IPHONEOS_DEPLOYMENT_TARGET[sdk=macosx*]`.** Xcode maps the iOS target to
  macOS through the SDK's version table; 15.1 (React Native's pods) is not in it and falls
  back to macOS 10.15, which the SDK rejects.
- **Sentry picks the AppKit slice.** @sentry/react-native keys its xcframework slices by SDK
  and maps Catalyst to a `maccatalyst` SDK that does not exist; a post_integrate hook points
  `FRAMEWORK_SEARCH_PATHS[sdk=macosx*]` at the Catalyst slice.
- **Not available on Catalyst:** Google Cast (no SDK slice; the JS goes through
  `packages/react-native-google-cast`, which goes inert), expo-camera (VisionKit scanner;
  excluded at `use_expo_modules!`), ActivityKit and `BGContinuedProcessingTask` in the
  background downloader (`!targetEnvironment(macCatalyst)`).
- **react-native-track-player** needs `CoreAudio` imported implicitly (`-import-module`).
- **React Native's ReactNativeDependencies.framework** Catalyst slice has its bundle symlinks
  materialized as copies; codesign calls it ambiguous. The embed script relinks the app's copy.
- **Tab switches never reached JS** (every tab but the first stayed blank): in the Mac
  idiom the tab bar is a toolbar control; selecting there calls neither `shouldSelect`
  delegate method react-native-bottom-tabs listens to, nor moves SwiftUI's selection
  binding. Only `didSelectTab` fires, which `patches/react-native-bottom-tabs@1.4.0.patch`
  forwards on Catalyst.
- **macOS 27 requires the UIScene lifecycle** at launch. The app adopts it for every iOS
  build through `expo-build-properties` `ios.enableSceneSupport`; the Mac build must not
  declare its own `UIApplicationSceneManifest`, or that option refuses to prebuild.
- `expo-build-properties` writes `EXPO_USE_PRECOMPILED_MODULES` itself, so precompiled
  modules are switched off in its options (app.config.ts), not in the Podfile properties.
- **The Mac plugin's mods must run last.** Expo runs a mod type's plugins in reverse
  list order, so `app.config.ts` puts `withMacCatalyst` first (`unshift`). Pushed last, its
  mods run before every other plugin's and see neither the Live Activity widget extension it
  filters to iOS nor the final entitlements it derives the Mac's from.
- **The Mac signs with its own entitlements** (`<Project>.macos.entitlements`, wired through
  `CODE_SIGN_ENTITLEMENTS[sdk=macosx*]`, derived in `plugins/mac-catalyst/macEntitlements.ts`).
  A Mac App Store build needs App Sandbox, and the sandbox blocks networking without
  `network.client`. The iOS App Group is dropped: it only shares state with the Live Activity
  widget, which the Mac lacks, and a Mac App Group needs the team-prefixed form. Push becomes
  `com.apple.developer.aps-environment`, the macOS key. The iOS-only Info.plist keys (Live
  Activities, the App Group id) are removed too, so the downloader falls back to standard
  defaults.
- **Archive with system tools first in PATH.** `bun run mac --archive` runs Xcode's
  install step, which calls `chown -RH` through PATH. GNU coreutils' chown (a Nix or Homebrew
  profile ahead of `/usr/sbin`) fails on the dangling symlinks in
  `ReactCodegen.framework` with "cannot dereference", so the archive fails on
  `SetOwnerAndGroup`. BSD chown does not; run it as
  `PATH="/usr/bin:/bin:/usr/sbin:/sbin:$PATH" bun run mac --archive`.
