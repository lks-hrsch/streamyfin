/**
 * The Mac app's entitlements, derived from the iOS app's final ones.
 *
 * The Mac build is the iOS target built for Mac Catalyst, so by default it
 * would sign with the iOS entitlements. Those carry what the Mac lacks (the
 * Live Activity widget's App Group, Wi-Fi information) and miss what the Mac
 * App Store requires (the App Sandbox), so the Mac gets a file of its own,
 * selected with CODE_SIGN_ENTITLEMENTS[sdk=macosx*] in plugins/withMacCatalyst.ts.
 */
export const MAC_ENTITLEMENTS_SUFFIX = ".macos.entitlements";

/** iOS entitlements the Mac build leaves out. */
const IOS_ONLY = new Set([
  // Shared with the Live Activity widget, which the Mac build does not embed.
  // Without it the download store falls back to the standard defaults.
  "com.apple.security.application-groups",
  // Access WiFi Information exists for iOS only; the Mac app reads no SSID.
  "com.apple.developer.networking.wifi-info",
]);

export const macEntitlements = (
  ios: Record<string, unknown>,
): Record<string, unknown> => {
  const mac: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(ios)) {
    if (IOS_ONLY.has(key)) continue;
    // Push keeps its environment under the macOS key.
    if (key === "aps-environment") {
      mac["com.apple.developer.aps-environment"] = value;
      continue;
    }
    mac[key] = value;
  }
  // The Mac App Store and TestFlight only take sandboxed apps; the app talks to
  // its Jellyfin and Seerr servers, and keeps its downloads in its own
  // container, so outgoing connections are all it needs.
  mac["com.apple.security.app-sandbox"] = true;
  mac["com.apple.security.network.client"] = true;
  return mac;
};

/**
 * Info.plist keys the Mac build drops: Live Activities do not exist there, and
 * the App Group key would point the download store at a group the Mac app is
 * not entitled to.
 */
export const IOS_ONLY_INFO_PLIST_KEYS = [
  "NSSupportsLiveActivities",
  "NSSupportsLiveActivitiesFrequentUpdates",
  "StreamyfinDownloadsAppGroupIdentifier",
];
