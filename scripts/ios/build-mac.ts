/**
 * Builds the native Mac app (Mac Catalyst) and opens it.
 *
 *   bun run prebuild:mac   # once, or after native changes
 *   bun run mac            # Release build with the JS bundle embedded
 *   bun run mac --debug    # Debug build, loads JS from Metro (bun run start)
 *   bun run mac --no-open  # build only
 *
 * Signing uses the team from app.json with automatic provisioning, so Xcode
 * must be signed in to that team's account.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "../..");
const args = new Set(process.argv.slice(2));
const configuration = args.has("--debug") ? "Debug" : "Release";
const derivedDataPath = join(repoRoot, "ios/build/mac");

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

execFileSync(
  "xcodebuild",
  [
    "-workspace",
    "ios/Streamyfin.xcworkspace",
    "-scheme",
    "Streamyfin",
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
