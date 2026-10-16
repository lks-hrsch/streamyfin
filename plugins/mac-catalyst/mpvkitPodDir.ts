import { join } from "node:path";

/**
 * The locally derived Catalyst MPVKit pod for the release a podspec URL pins,
 * as prepared by scripts/ios/mpvkit-catalyst.ts. Kept apart from the plugin:
 * app.config.ts reads it, and must not load expo/config-plugins to do so.
 */
export const mpvkitCatalystPodDir = (projectRoot: string, podspecUrl: string) =>
  join(
    projectRoot,
    "node_modules/.cache/mpvkit-catalyst",
    podspecUrl.split("/").at(-2) ?? "unknown",
  );
