import { macEntitlements } from "./macEntitlements";

// What the iOS prebuild gives the app: Wi-Fi info from app.json, push from
// expo-notifications, the App Group from withDownloadLiveActivity.
const ios = {
  "com.apple.developer.networking.wifi-info": true,
  "aps-environment": "production",
  "com.apple.security.application-groups": [
    "group.de.lkshrsch.streamyfin.downloads",
  ],
  "keychain-access-groups": ["$(AppIdentifierPrefix)de.lkshrsch.streamyfin"],
};

describe("macEntitlements", () => {
  test("sandboxes the Mac app with outgoing connections only", () => {
    const mac = macEntitlements(ios);
    expect(mac["com.apple.security.app-sandbox"]).toBe(true);
    expect(mac["com.apple.security.network.client"]).toBe(true);
    expect(mac).not.toHaveProperty("com.apple.security.network.server");
  });

  test("leaves out what only iOS has", () => {
    const mac = macEntitlements(ios);
    expect(mac).not.toHaveProperty("com.apple.security.application-groups");
    expect(mac).not.toHaveProperty("com.apple.developer.networking.wifi-info");
  });

  test("keeps push under the macOS key", () => {
    const mac = macEntitlements(ios);
    expect(mac["com.apple.developer.aps-environment"]).toBe("production");
    expect(mac).not.toHaveProperty("aps-environment");
  });

  test("passes everything else through", () => {
    expect(macEntitlements(ios)["keychain-access-groups"]).toEqual([
      "$(AppIdentifierPrefix)de.lkshrsch.streamyfin",
    ]);
  });

  test("does not change the iOS entitlements it is given", () => {
    const copy = structuredClone(ios);
    macEntitlements(ios);
    expect(ios).toEqual(copy);
  });
});
