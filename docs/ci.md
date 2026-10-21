# Release pipeline

`.github/workflows/release.yml` builds every target on merge to `main`, one matrix entry per
target, each behind its own approval environment. iOS and tvOS build on a self-hosted Mac
with fastlane (`fastlane/Fastfile`, `platform :ios`) and upload to TestFlight. The `.ipa` is
also attached to the run. EAS is not used for Apple; `eas.json` stays for Android.

Never add a `pull_request` trigger. The self-hosted runner executes whatever the checkout
contains.

## Run it

- **On merge to `main`**: approve `production-ios` and `production-tvos` in "Review pending
  deployments".
- **Manually**: Actions, Release, Run workflow on `main`. Tick `dry_run` to build and sign
  without uploading.

## Build number

`fastlane ios build_number` reads the latest TestFlight build and adds one. The workflow exports
it as `IOS_BUILD_NUMBER`; `app.config.ts` writes it to `ios.buildNumber` before prebuild, and
the lane passes it as `CURRENT_PROJECT_VERSION` so the extensions match the app.

## Runner

A nix-darwin Mac, labels `self-hosted, macOS, ARM64, xcode-27.1`, jobs run without sudo.
Tools come from `nix develop` (pinned by `flake.lock`), Xcode from `DEVELOPER_DIR`. Signing
uses a keychain created per run and deleted at the end. For that the runner must run in its
user's launchd domain (`launchctl asuser`, `launchctl managername` prints `Background`), with
`SessionCreate` and a writable `~/Library` at the user's recorded home. In the system domain
codesign fails with `errSecInternalComponent`.

## Secrets

| Where | Name | Holds |
| --- | --- | --- |
| GitHub secret | `OP_SERVICE_ACCOUNT_TOKEN` | Read-only service account for vault `ci-streamyfin` |
| GitHub variable | `APPLE_TEAM_ID` | Apple team ID |
| 1Password `asc-api-key` | `key-id`, `issuer-id`, `credential` | App Store Connect API key; `credential` is the `.p8` text or its base64 |
| 1Password `apple-distribution` | `p12-base64`, `credential` | Apple Distribution `.p12` in base64, and its password |

Provisioning profiles are not stored: every run fetches or creates them with the API key.

## Run it locally

```bash
export APPLE_TEAM_ID=BWMWYHN53X KC_PW="$(openssl rand -hex 24)"
export ASC_KEY_ID="$(op read op://ci-streamyfin/asc-api-key/key-id)"
export ASC_ISSUER_ID="$(op read op://ci-streamyfin/asc-api-key/issuer-id)"
export ASC_KEY_P8="$(op read op://ci-streamyfin/asc-api-key/credential)"
export DIST_P12_B64="$(op read op://ci-streamyfin/apple-distribution/p12-base64)"
export DIST_P12_PW="$(op read op://ci-streamyfin/apple-distribution/credential)"
nix develop --command fastlane ios build_number target:ios   # prints the next number
export IOS_BUILD_NUMBER=<n>
EXPO_TV=0 nix develop --command bun x expo prebuild --platform ios --clean --no-install
nix develop --command pod install --project-directory=ios
nix develop --command fastlane ios release target:ios dry_run:true
```

Use `EXPO_TV=1` and `target:tvos` for tvOS.

## Adding Android

Add matrix entries with `platform: android` and an Ubuntu `runner`, Android secrets in a
step gated on `matrix.platform == 'android'`, and a `platform :android` block with a
`release` lane in the Fastfile. The shared steps already pass `matrix.platform` through.
