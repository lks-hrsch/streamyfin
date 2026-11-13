import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NORMALIZE_FRAMEWORK_SH } from "./withMacCatalyst";

// expo/config-plugins pulls in the xcode package, which Jest cannot parse;
// only the embed script's shell function is under test here.
jest.mock("expo/config-plugins", () => ({}));

const normalize = (framework: string) =>
  execFileSync(
    "bash",
    [
      "-c",
      `${NORMALIZE_FRAMEWORK_SH}\nstreamyfin_normalize_versioned_framework "$1"`,
      "normalize",
      framework,
    ],
    { stdio: "pipe" },
  );

const newFramework = (name: string) => {
  const framework = path.join(
    mkdtempSync(path.join(tmpdir(), "framework-")),
    `${name}.framework`,
  );
  mkdirSync(path.join(framework, "Versions", "A", "Resources"), {
    recursive: true,
  });
  writeFileSync(path.join(framework, "Versions", "A", name), "binary");
  writeFileSync(
    path.join(framework, "Versions", "A", "Resources", "Info.plist"),
    "plist",
  );
  return framework;
};

const linkTarget = (entry: string) =>
  lstatSync(entry).isSymbolicLink() ? readlinkSync(entry) : "not a symlink";

// What codesign accepts for a versioned bundle: the version, binary and
// Resources linked, nothing else at the top.
const expectSealableLayout = (framework: string, name: string) => {
  expect(readdirSync(framework).sort()).toEqual(
    [name, "Resources", "Versions"].sort(),
  );
  expect(linkTarget(path.join(framework, "Versions", "Current"))).toBe("A");
  expect(linkTarget(path.join(framework, name))).toBe(
    `Versions/Current/${name}`,
  );
  expect(linkTarget(path.join(framework, "Resources"))).toBe(
    "Versions/Current/Resources",
  );
};

describe("streamyfin_normalize_versioned_framework", () => {
  // React-Core-prebuilt's Catalyst slice: the links are right, but the privacy
  // manifest and the strings bundle sit at the top, which codesign rejects as
  // "unsealed contents present in the root directory".
  it("moves loose top-level entries into Resources when the links are intact", () => {
    const framework = newFramework("React");
    symlinkSync("A", path.join(framework, "Versions", "Current"));
    symlinkSync("Versions/Current/React", path.join(framework, "React"));
    symlinkSync(
      "Versions/Current/Resources",
      path.join(framework, "Resources"),
    );
    writeFileSync(path.join(framework, "PrivacyInfo.xcprivacy"), "privacy");
    mkdirSync(path.join(framework, "RCTI18nStrings.bundle", "en.lproj"), {
      recursive: true,
    });

    normalize(framework);

    expectSealableLayout(framework, "React");
    const resources = path.join(framework, "Versions", "A", "Resources");
    expect(existsSync(path.join(resources, "PrivacyInfo.xcprivacy"))).toBe(
      true,
    );
    expect(
      existsSync(path.join(resources, "RCTI18nStrings.bundle", "en.lproj")),
    ).toBe(true);
  });

  // ReactNativeDependencies' Catalyst slice: every link materialized as a copy.
  it("rebuilds the links of a bundle whose symlinks were copied", () => {
    const framework = newFramework("ReactNativeDependencies");
    mkdirSync(path.join(framework, "Versions", "Current", "Resources"), {
      recursive: true,
    });
    writeFileSync(path.join(framework, "ReactNativeDependencies"), "binary");
    mkdirSync(path.join(framework, "Resources"));
    mkdirSync(path.join(framework, "Privacy.bundle"));

    normalize(framework);

    expectSealableLayout(framework, "ReactNativeDependencies");
    expect(
      existsSync(
        path.join(framework, "Versions", "A", "Resources", "Privacy.bundle"),
      ),
    ).toBe(true);
  });

  // A rebuild embeds the framework again over the app's earlier copy.
  it("replaces an entry a previous run already moved", () => {
    const framework = newFramework("React");
    symlinkSync("A", path.join(framework, "Versions", "Current"));
    symlinkSync("Versions/Current/React", path.join(framework, "React"));
    symlinkSync(
      "Versions/Current/Resources",
      path.join(framework, "Resources"),
    );
    mkdirSync(
      path.join(framework, "Versions", "A", "Resources", "Strings.bundle"),
    );
    mkdirSync(path.join(framework, "Strings.bundle"));

    normalize(framework);

    expectSealableLayout(framework, "React");
    expect(
      existsSync(
        path.join(
          framework,
          "Versions",
          "A",
          "Resources",
          "Strings.bundle",
          "Strings.bundle",
        ),
      ),
    ).toBe(false);
  });

  it("leaves a flat iOS framework alone", () => {
    const framework = path.join(
      mkdtempSync(path.join(tmpdir(), "framework-")),
      "Flat.framework",
    );
    mkdirSync(framework);
    writeFileSync(path.join(framework, "Flat"), "binary");
    writeFileSync(path.join(framework, "Info.plist"), "plist");

    normalize(framework);

    expect(readdirSync(framework).sort()).toEqual(["Flat", "Info.plist"]);
  });
});
