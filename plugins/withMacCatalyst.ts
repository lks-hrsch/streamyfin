import { writeFileSync } from "node:fs";
import { join } from "node:path";
import plist from "@expo/plist";
import {
  type ConfigPlugin,
  withEntitlementsPlist,
  withInfoPlist,
  withPodfile,
  withXcodeProject,
} from "expo/config-plugins";
import {
  IOS_ONLY_INFO_PLIST_KEYS,
  MAC_ENTITLEMENTS_SUFFIX,
  macEntitlements,
} from "./mac-catalyst/macEntitlements";

/**
 * Expo modules that do not build for Mac Catalyst. Expo autolinking ignores
 * react-native.config.js, so they are excluded at the `use_expo_modules!`
 * call instead. expo-camera's scanner is built on VisionKit's
 * DataScannerViewController, which Catalyst lacks.
 */
const CATALYST_EXCLUDED_EXPO_MODULES = ["expo-camera"];

const CATALYST_PODS_MARKER = "# Mac Catalyst: pods opt in";
/**
 * Pods opt into Catalyst like the app target does. Their deployment targets
 * need lifting too, for the Catalyst slice only: Xcode maps an iOS deployment
 * target to macOS through the SDK's version table, which has no entry for
 * versions Catalyst never shipped (15.1, which React Native's pods use), and an
 * unmapped version falls back to macOS 10.15, which the SDK then rejects. The
 * app's own iOS deployment target is always mapped, so the pods take that.
 *
 * Apple Silicon only: the Catalyst MPVKit slice is derived from the arm64 iOS
 * slice, so x86_64 is left out of the Mac build for every target.
 */
const CATALYST_PODS_SNIPPET = `    ${CATALYST_PODS_MARKER} (plugins/withMacCatalyst.ts)
    catalyst_deployment_target = podfile_properties['ios.deploymentTarget'] || '16.4'
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |c|
        c.build_settings['SUPPORTS_MACCATALYST'] = 'YES'
        c.build_settings['IPHONEOS_DEPLOYMENT_TARGET[sdk=macosx*]'] = catalyst_deployment_target
        c.build_settings['EXCLUDED_ARCHS[sdk=macosx*]'] = 'x86_64'
      end
    end
`;

/**
 * Fix-ups CocoaPods' generated xcconfigs need for Catalyst. They are only
 * final once CocoaPods has written them, hence post_integrate.
 *
 * @sentry/react-native wires its Sentry.xcframework slices per SDK and maps
 * the Catalyst slice to a `maccatalyst` SDK that does not exist: Catalyst
 * builds against `macosx`, so they get the AppKit slice, whose Swift module
 * lacks the UIKit-only hybrid SDK API RNSentry calls.
 *
 * react-native-track-player's SwiftAudioEx uses
 * UnsafeMutableAudioBufferListPointer, which lives in CoreAudio's Swift
 * overlay. AVFoundation re-exports that overlay on iOS but not on Catalyst, so
 * the pod gets CoreAudio as an implicit import instead of a source patch (bun
 * cannot patch a GitHub dependency). Harmless on iOS, where CoreAudio exists.
 *
 * React Native's prebuilt ReactNativeDependencies.framework ships its Catalyst
 * slice with every symlink of a versioned macOS bundle materialized as a copy
 * (binary and Resources at the top and under Versions/A, Versions/Current a
 * directory), plus its privacy bundles at the top. codesign rejects that as
 * "bundle format is ambiguous", so the embed script rebuilds the symlinks in
 * the app's copy before stripping and signing it. The Pods copy is left alone:
 * React Native re-extracts it whenever the configuration changes.
 */
const NORMALIZE_FRAMEWORK_SH = `
# Mac Catalyst (plugins/withMacCatalyst.ts): rebuild a versioned bundle whose symlinks were copied.
streamyfin_normalize_versioned_framework() {
  local fw="$1"
  local name
  name="$(basename "$fw" .framework)"
  [ -d "$fw/Versions/A" ] && [ ! -L "$fw/Versions/Current" ] || return 0
  for entry in "$fw"/*; do
    case "$(basename "$entry")" in
      Versions) ;;
      "$name"|Resources) rm -rf "$entry" ;;
      *) mv "$entry" "$fw/Versions/A/Resources/" ;;
    esac
  done
  rm -rf "$fw/Versions/Current"
  ln -s A "$fw/Versions/Current"
  ln -s "Versions/Current/$name" "$fw/$name"
  ln -s Versions/Current/Resources "$fw/Resources"
}
`;

const CATALYST_XCCONFIG_SNIPPET = String.raw`
# Mac Catalyst: xcconfig and embed-script fixes (plugins/withMacCatalyst.ts)
NORMALIZE_FRAMEWORK_SH = <<~'SH'
${NORMALIZE_FRAMEWORK_SH.trim()}
SH
post_integrate do |installer|
  Dir.glob(File.join(installer.sandbox.root, 'Target Support Files', '*', '*.xcconfig')).each do |path|
    content = File.read(path)
    patched = content.gsub(/^FRAMEWORK_SEARCH_PATHS\[sdk=macosx\*\] = .*sentry-xcframeworks.*$/) do |line|
      line.gsub('macos-arm64_arm64e_x86_64', 'ios-arm64_arm64e_x86_64-maccatalyst')
    end
    if File.basename(path).start_with?('react-native-track-player.') && !patched.include?('-import-module -Xfrontend CoreAudio')
      patched = patched.sub(/^(OTHER_SWIFT_FLAGS = .*)$/) { "#{$1} -Xfrontend -import-module -Xfrontend CoreAudio" }
    end
    File.write(path, patched) unless patched == content
  end
  Dir.glob(File.join(installer.sandbox.root, 'Target Support Files', '*', '*-frameworks.sh')).each do |path|
    content = File.read(path)
    next if content.include?('streamyfin_normalize_versioned_framework')
    patched = content.sub(/^install_framework\(\)/) { "#{NORMALIZE_FRAMEWORK_SH}\ninstall_framework()" }
    patched = patched.sub(/^(  rsync --delete -av .*"\$\{source\}" "\$\{destination\}"\n)/) do
      "#{$1}  streamyfin_normalize_versioned_framework \"\${destination}/$(basename \"$1\")\"\n"
    end
    File.write(path, patched)
  end
end
`;

/**
 * Turns the iOS app target into a native Mac app (Mac Catalyst). Used by
 * `bun run prebuild:mac` (STREAMYFIN_MAC_CATALYST=1) only: the iOS and tvOS
 * prebuilds never load it, so their projects stay exactly as they were.
 *
 * - The app target opts into Catalyst with the Mac idiom (device family 6,
 *   "Optimize Interface for Mac"), so UIKit lays out at the Mac's own scale
 *   instead of shrinking an iPad layout to 77 %.
 * - Pods follow the app into Catalyst, and the Podfile and its generated files
 *   get the fixes listed at CATALYST_PODS_SNIPPET and CATALYST_XCCONFIG_SNIPPET.
 * - App extensions (the iOS-only Live Activity widget) are filtered to iOS.
 * - The Mac signs with entitlements of its own (App Sandbox, network client,
 *   nothing Live Activity related), see plugins/mac-catalyst/macEntitlements.ts.
 * - Apple Silicon only, see CATALYST_PODS_SNIPPET.
 *
 * Elsewhere: Google Cast leaves autolinking in react-native.config.js, Expo's
 * precompiled modules and MPVKit's release pod are swapped out in
 * app.config.ts, and MPVKit's Catalyst slice comes from
 * scripts/ios/mpvkit-catalyst.ts.
 */
const withMacCatalyst: ConfigPlugin = (config) => {
  config = withPodfile(config, (mod) => {
    let podfile = mod.modResults.contents
      .replace(
        ":mac_catalyst_enabled => false",
        ":mac_catalyst_enabled => true",
      )
      .replace(
        /use_expo_modules!(?!\()/,
        `use_expo_modules!({ exclude: ${JSON.stringify(CATALYST_EXCLUDED_EXPO_MODULES)} })`,
      );
    if (!podfile.includes(CATALYST_PODS_MARKER)) {
      podfile = podfile.replace(
        "post_install do |installer|",
        `post_install do |installer|\n${CATALYST_PODS_SNIPPET}`,
      );
      // Autolinking reads react-native.config.js on every `pod install`, and
      // that file leaves Google Cast out only while this flag is set. Pinning
      // it here keeps a later bare `pod install` from linking it back in.
      podfile = `ENV['STREAMYFIN_MAC_CATALYST'] = '1'\n${podfile}${CATALYST_XCCONFIG_SNIPPET}`;
    }
    mod.modResults.contents = podfile;
    return mod;
  });

  config = withInfoPlist(config, (mod) => {
    mod.modResults.LSApplicationCategoryType =
      "public.app-category.entertainment";
    for (const key of IOS_ONLY_INFO_PLIST_KEYS) delete mod.modResults[key];
    return mod;
  });

  // Writes the Mac's own entitlements next to the iOS ones, from the iOS ones
  // as every other plugin left them (this plugin's mods run last, see
  // app.config.ts). The iOS file itself stays untouched.
  config = withEntitlementsPlist(config, (mod) => {
    if (mod.modRequest.introspect) return mod;
    const { platformProjectRoot, projectName } = mod.modRequest;
    writeFileSync(
      join(
        platformProjectRoot,
        projectName!,
        `${projectName}${MAC_ENTITLEMENTS_SUFFIX}`,
      ),
      plist.build(macEntitlements(mod.modResults)),
    );
    return mod;
  });

  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const objects = project.hash.project.objects;
    const app = project.getFirstTarget();

    const configurationList =
      objects.XCConfigurationList[app.firstTarget.buildConfigurationList];
    for (const { value } of configurationList.buildConfigurations) {
      const settings = objects.XCBuildConfiguration[value].buildSettings;
      settings.SUPPORTS_MACCATALYST = "YES";
      settings.SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD = "NO";
      settings.TARGETED_DEVICE_FAMILY = '"1,2,6"';
      // Same bundle identifier on the Mac, so it shares the App ID (and later
      // a universal purchase) with the iOS app instead of a "maccatalyst."
      // twin that needs its own registration.
      settings.DERIVE_MACCATALYST_PRODUCT_BUNDLE_IDENTIFIER = "NO";
      settings['"EXCLUDED_ARCHS[sdk=macosx*]"'] = "x86_64";
      settings['"CODE_SIGN_ENTITLEMENTS[sdk=macosx*]"'] =
        `${mod.modRequest.projectName}/${mod.modRequest.projectName}${MAC_ENTITLEMENTS_SUFFIX}`;
    }

    for (const { value } of app.firstTarget.dependencies ?? []) {
      const dependency = objects.PBXTargetDependency[value];
      if (dependency) dependency.platformFilter = "ios";
    }
    for (const { value } of app.firstTarget.buildPhases ?? []) {
      const phase = objects.PBXCopyFilesBuildPhase?.[value];
      if (!phase) continue;
      for (const file of phase.files ?? []) {
        const buildFile = objects.PBXBuildFile[file.value];
        if (buildFile) buildFile.platformFilter = "ios";
      }
    }
    return mod;
  });
};

export default withMacCatalyst;
