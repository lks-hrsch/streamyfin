import { resolve } from "node:path";
import { macBuildArgs, macDerivedDataPath } from "./macXcodebuild";

const repoRoot = resolve(__dirname, "../..");

describe("macDerivedDataPath", () => {
  it("builds in Xcode's DerivedData, outside the checkout", () => {
    const path = macDerivedDataPath("/Users/someone");

    expect(path).toBe(
      "/Users/someone/Library/Developer/Xcode/DerivedData/streamyfin-mac",
    );
    expect(path.startsWith(repoRoot)).toBe(false);
  });
});

describe("macBuildArgs", () => {
  it("lets Xcode register an unknown Mac for development signing", () => {
    const args = macBuildArgs("Release", "/tmp/dd");

    expect(args).toContain("-allowProvisioningDeviceRegistration");
    // The registration flag only takes effect together with this one.
    expect(args).toContain("-allowProvisioningUpdates");
  });

  it("builds the requested configuration into the given DerivedData", () => {
    const args = macBuildArgs("Debug", "/tmp/dd");

    expect(args[args.indexOf("-configuration") + 1]).toBe("Debug");
    expect(args[args.indexOf("-derivedDataPath") + 1]).toBe("/tmp/dd");
    expect(args.at(-1)).toBe("build");
  });
});
