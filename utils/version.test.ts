let mockBuild: Record<string, unknown> = {};

jest.mock("expo-application", () => ({
  nativeApplicationVersion: "0.56.0",
  nativeBuildVersion: "42",
}));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: { build: mockBuild } };
    },
  },
}));

import { getVersionInfo } from "./version";

describe("getVersionInfo", () => {
  const dev = (globalThis as { __DEV__?: boolean }).__DEV__;
  // A release build: the run number only shows outside development.
  beforeEach(() => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  });
  afterEach(() => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = dev;
  });

  // Expo embeds a null config value as {} in the app's config; a local build
  // has neither a profile nor a run number.
  test("an embedded empty object reads as absent, not as text", () => {
    mockBuild = {
      commit: "4faddc5",
      branch: "develop",
      profile: {},
      runNumber: {},
    };
    const info = getVersionInfo();
    expect(info.runNumber).toBeNull();
    expect(info.profile).toBeNull();
    expect(info.display).not.toContain("object");
  });

  test("a CI build shows its run number", () => {
    mockBuild = { commit: "4faddc5", profile: "ci", runNumber: "2098" };
    expect(getVersionInfo().display).toBe("0.56.0 · 4faddc5 · #2098");
  });
});
