/**
 * Prepares a Mac Catalyst capable MPVKit pod for `bun run prebuild:mac`.
 *
 * The streamyfin/MPVKit release ships iOS and tvOS slices only, and the player
 * has no fallback, so a Catalyst build would have nothing to play with.
 * Rebuilding ffmpeg and mpv for Catalyst needs a full autotools and meson
 * toolchain and most of an hour; this derives the Catalyst slice from the iOS
 * device slice instead. Both are arm64 code against the same SDK surface, and
 * the linker only refuses the objects for the platform they declare, so the
 * declaration is rewritten in place:
 *
 * - LC_BUILD_VERSION: platform IOS (2) becomes MACCATALYST (6), with the
 *   minimum raised to 14.0 where an object asks for less.
 * - LC_VERSION_MIN_IPHONEOS, carried by the Rust objects of libdovi: it cannot
 *   grow into an LC_BUILD_VERSION, which is 8 bytes larger, and those objects
 *   have no header slack, so it becomes a same-sized LC_SOURCE_VERSION. The
 *   linker then treats the object as platform neutral and takes the platform
 *   of the link.
 *
 * Patching inside the archive rather than extracting it keeps the members that
 * share a name with another member, which `ar -x` would silently collapse.
 *
 * One part of the iOS slice cannot carry over: libmpv's OpenGL ES hardware
 * decoding interop (hwdec_ios_gl), since Catalyst has no OpenGL ES at all. The
 * app renders through vo=avfoundation and never reaches it, but the linker
 * still needs its five references resolved, so a stub object that fails every
 * call is added to the archive (GLES_SHIM below).
 *
 * Apple Silicon only: there is no x86_64 device slice to derive an Intel one
 * from. The proper fix is upstream, where the fork's build script already knows
 * the `maccatalyst` platform and the release simply leaves it out.
 */
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { mpvkitCatalystPodDir } from "../../plugins/mac-catalyst/mpvkitPodDir";
import { retagArchiveForCatalyst } from "./machORetag";

const CATALYST_SLICE = "ios-arm64-maccatalyst";
/** Bump when the recipe changes, so a cached pod from an older one is rebuilt. */
const RECIPE = "2";

/**
 * Stand-ins for the OpenGL ES API libmpv's iOS GL interop references. Every
 * call fails, which mpv reads as "GL interop unavailable"; it only gets that
 * far with an OpenGL renderer, which the app does not use.
 */
const GLES_SHIM = `#include <stddef.h>
#include <stdint.h>
#import <Foundation/Foundation.h>

// kCVReturnUnsupported
static const int32_t unsupported = -6672;

int32_t CVOpenGLESTextureCacheCreate(const void *allocator, const void *cacheAttributes,
                                     const void *eaglContext, const void *textureAttributes,
                                     void **cacheOut) {
  if (cacheOut) *cacheOut = NULL;
  return unsupported;
}

int32_t CVOpenGLESTextureCacheCreateTextureFromImage(
    const void *allocator, void *cache, void *image, const void *attributes, uint32_t target,
    int32_t internalFormat, int32_t width, int32_t height, uint32_t format, uint32_t type,
    size_t planeIndex, void **textureOut) {
  if (textureOut) *textureOut = NULL;
  return unsupported;
}

void CVOpenGLESTextureCacheFlush(void *cache, uint64_t options) {}

uint32_t CVOpenGLESTextureGetName(void *texture) { return 0; }

@interface EAGLContext : NSObject
@end

@implementation EAGLContext
+ (instancetype)currentContext {
  return nil;
}
@end
`;

const repoRoot = resolve(import.meta.dir, "../..");

const mpvkitPodspecUrl = (): string => {
  const appJson = JSON.parse(readFileSync(join(repoRoot, "app.json"), "utf8"));
  for (const plugin of appJson.expo.plugins) {
    if (
      Array.isArray(plugin) &&
      plugin[0] === "./plugins/withGitPod.ts" &&
      plugin[1]?.podName === "MPVKit"
    ) {
      return plugin[1].podspecUrl;
    }
  }
  throw new Error("app.json has no withGitPod entry for MPVKit");
};

const run = (cmd: string, args: string[], cwd?: string) =>
  execFileSync(cmd, args, { cwd, stdio: "inherit" });

const prepare = () => {
  const podspecUrl = mpvkitPodspecUrl();
  const outDir = mpvkitCatalystPodDir(repoRoot, podspecUrl);
  const xcframework = join(outDir, "MPVKit.xcframework");
  const binaryPath = join(
    xcframework,
    CATALYST_SLICE,
    "MPVKit.framework/MPVKit",
  );
  const marker = join(outDir, `.recipe-${RECIPE}`);
  if (existsSync(marker) && existsSync(binaryPath)) {
    console.log(`MPVKit Catalyst pod already prepared at ${outDir}`);
    return;
  }

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const podspec = execFileSync("curl", ["-fsSL", podspecUrl]).toString();
  const zipUrl = podspec.match(/:http\s*=>\s*'([^']+)'/)?.[1];
  if (!zipUrl) throw new Error(`No :http source in ${podspecUrl}`);

  run("curl", ["-fsSL", "-o", join(outDir, "MPVKit.zip"), zipUrl]);
  run("unzip", ["-q", "MPVKit.zip"], outDir);
  rmSync(join(outDir, "MPVKit.zip"));

  cpSync(join(xcframework, "ios-arm64"), join(xcframework, CATALYST_SLICE), {
    recursive: true,
  });
  const binary = readFileSync(binaryPath);
  const stats = retagArchiveForCatalyst(binary);
  writeFileSync(binaryPath, binary);
  console.log(
    `Retagged ${stats.retagged} and neutralized ${stats.neutralized} of ${stats.objects} objects`,
  );

  const shimSource = join(outDir, "catalyst_gles_shim.m");
  const shimObject = join(outDir, "catalyst_gles_shim.o");
  writeFileSync(shimSource, GLES_SHIM);
  run("xcrun", [
    "clang",
    "-target",
    "arm64-apple-ios14.0-macabi",
    "-isysroot",
    execFileSync("xcrun", ["--sdk", "macosx", "--show-sdk-path"])
      .toString()
      .trim(),
    "-fobjc-arc",
    "-O2",
    "-c",
    shimSource,
    "-o",
    shimObject,
  ]);
  run("xcrun", ["ar", "-q", binaryPath, shimObject]);
  run("xcrun", ["ranlib", binaryPath]);
  rmSync(shimSource);
  rmSync(shimObject);

  const infoPath = join(xcframework, "Info.plist");
  const info = JSON.parse(
    execFileSync("plutil", [
      "-convert",
      "json",
      "-o",
      "-",
      infoPath,
    ]).toString(),
  );
  info.AvailableLibraries.push({
    LibraryIdentifier: CATALYST_SLICE,
    LibraryPath: "MPVKit.framework",
    SupportedArchitectures: ["arm64"],
    SupportedPlatform: "ios",
    SupportedPlatformVariant: "maccatalyst",
  });
  writeFileSync(infoPath, JSON.stringify(info));
  run("plutil", ["-convert", "xml1", infoPath]);

  // Consumed as a :path pod, so the source is never fetched; everything else
  // (system frameworks, libraries, linker flags) stays the upstream podspec's.
  writeFileSync(
    join(outDir, "MPVKit.podspec"),
    podspec.replace(/^(\s*)s\.source\s*=.*$/m, "$1s.source = { :path => '.' }"),
  );
  writeFileSync(marker, "");
  console.log(`MPVKit Catalyst pod ready at ${outDir}`);
};

if (import.meta.main) prepare();
