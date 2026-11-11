import { join } from "node:path";

/** The workspace and scheme every Mac xcodebuild call builds. */
export const macWorkspaceArgs = [
  "-workspace",
  "ios/Streamyfin.xcworkspace",
  "-scheme",
  "Streamyfin",
];

/**
 * Xcode's own DerivedData folder rather than ios/build: inside ~/Documents
 * (synced by iCloud on many Macs) the bundle's files pick up extended
 * attributes, and codesign fails with "resource fork, Finder information, or
 * similar detritus not allowed".
 */
export function macDerivedDataPath(home: string) {
  return join(home, "Library/Developer/Xcode/DerivedData/streamyfin-mac");
}

/** `xcodebuild build` for this Apple Silicon Mac, as `bun run mac` runs it. */
export function macBuildArgs(
  configuration: "Debug" | "Release",
  derivedDataPath: string,
) {
  return [
    ...macWorkspaceArgs,
    "-configuration",
    configuration,
    "-destination",
    "platform=macOS,variant=Mac Catalyst,arch=arm64",
    "-derivedDataPath",
    derivedDataPath,
    "-allowProvisioningUpdates",
    // Development signing only covers Macs in the team's device list; without
    // this an unregistered Mac fails with "Device ... isn't registered".
    "-allowProvisioningDeviceRegistration",
    "build",
  ];
}
