/**
 * Builds the native Mac app (Mac Catalyst) and opens it.
 *
 *   bun run prebuild:mac   # once, or after native changes
 *   bun run mac            # Release build with the JS bundle embedded
 *   bun run mac --debug    # Debug build, loads JS from Metro (bun run start)
 *   bun run mac --no-open  # build only
 *   bun run mac --archive  # archive and export for App Store Connect (TestFlight)
 *   bun run mac --archive --export-method development  # same, signed for this Mac
 *   bun run mac --archive --upload  # export straight to App Store Connect
 *
 * Signing uses the team from app.json with automatic provisioning, so Xcode
 * must be signed in to that team's account. The App Store Connect export needs
 * that team's distribution certificates; `--export-method development` checks
 * the archive path without them.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import plist from "@expo/plist";

const repoRoot = resolve(import.meta.dir, "../..");
const argv = process.argv.slice(2);
const args = new Set(argv);
const configuration = args.has("--debug") ? "Debug" : "Release";
const derivedDataPath = join(repoRoot, "ios/build/mac");
const workspace = ["-workspace", "ios/Streamyfin.xcworkspace"];
const scheme = ["-scheme", "Streamyfin"];

const project = readFileSync(
  join(repoRoot, "ios/Streamyfin.xcodeproj/project.pbxproj"),
  "utf8",
);
if (!project.includes("SUPPORTS_MACCATALYST = YES")) {
  console.error(
    "ios/ was not prebuilt for the Mac. Run `bun run prebuild:mac` first.",
  );
  process.exit(1);
}

if (args.has("--archive")) {
  archive();
  process.exit(0);
}

execFileSync(
  "xcodebuild",
  [
    ...workspace,
    ...scheme,
    "-configuration",
    configuration,
    "-destination",
    "platform=macOS,variant=Mac Catalyst,arch=arm64",
    "-derivedDataPath",
    derivedDataPath,
    "-allowProvisioningUpdates",
    "build",
  ],
  { cwd: repoRoot, stdio: "inherit" },
);

const app = join(
  derivedDataPath,
  `Build/Products/${configuration}-maccatalyst/Streamyfin.app`,
);
if (!existsSync(app)) throw new Error(`Build finished without ${app}`);
console.log(`\nBuilt ${app}`);
if (!args.has("--no-open")) execFileSync("open", [app]);

/**
 * Archives the Release app for any Apple Silicon Mac and exports it. The
 * default export is the App Store Connect package TestFlight takes; the team
 * comes from app.json, like the build's own signing.
 */
function archive() {
  const exportMethodIndex = argv.indexOf("--export-method");
  const method =
    exportMethodIndex >= 0 ? argv[exportMethodIndex + 1] : "app-store-connect";
  if (!method || method.startsWith("--")) {
    throw new Error("--export-method needs a value, e.g. development");
  }
  const archivePath = join(derivedDataPath, "Streamyfin.xcarchive");
  const exportPath = join(derivedDataPath, "export");
  const exportOptionsPath = join(derivedDataPath, "ExportOptions.plist");
  const teamID = JSON.parse(readFileSync(join(repoRoot, "app.json"), "utf8"))
    .expo?.ios?.appleTeamId;

  execFileSync(
    "xcodebuild",
    [
      ...workspace,
      ...scheme,
      "-configuration",
      "Release",
      "-destination",
      "generic/platform=macOS,variant=Mac Catalyst",
      "-derivedDataPath",
      derivedDataPath,
      "-archivePath",
      archivePath,
      "-allowProvisioningUpdates",
      "archive",
    ],
    { cwd: repoRoot, stdio: "inherit" },
  );

  writeFileSync(
    exportOptionsPath,
    plist.build({
      method,
      ...(teamID && { teamID }),
      signingStyle: "automatic",
      // "upload" hands the package to App Store Connect itself; "export"
      // leaves it in exportPath for Transporter.
      destination: args.has("--upload") ? "upload" : "export",
    }),
  );

  execFileSync(
    "xcodebuild",
    [
      "-exportArchive",
      "-archivePath",
      archivePath,
      "-exportPath",
      exportPath,
      "-exportOptionsPlist",
      exportOptionsPath,
      "-allowProvisioningUpdates",
    ],
    { cwd: repoRoot, stdio: "inherit" },
  );
  console.log(`\nArchived ${archivePath}\nExported to ${exportPath}`);
}
