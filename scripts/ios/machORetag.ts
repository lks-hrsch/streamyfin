/**
 * Rewrites the platform Mach-O objects declare, so an iOS device slice can link
 * into a Mac Catalyst app. Kept apart from scripts/ios/mpvkit-catalyst.ts,
 * which runs under bun, so it can be tested in Jest.
 */

const LC_BUILD_VERSION = 0x32;
const LC_VERSION_MIN_IPHONEOS = 0x25;
const LC_SOURCE_VERSION = 0x2a;
const PLATFORM_IOS = 2;
const PLATFORM_MACCATALYST = 6;
const MH_MAGIC_64 = 0xfeedfacf;
/** Catalyst starts at 13.1; 14.0 matches the pod's iOS deployment target. */
const CATALYST_MIN_VERSION = 14 << 16;
export interface RetagStats {
  objects: number;
  retagged: number;
  neutralized: number;
}

/**
 * Rewrites the platform of every 64-bit Mach-O member of a static archive, in
 * place. Pure over the buffer so it can be tested without the release binary.
 */
export const retagArchiveForCatalyst = (archive: Uint8Array): RetagStats => {
  const view = new DataView(
    archive.buffer,
    archive.byteOffset,
    archive.byteLength,
  );
  const ascii = (from: number, to: number) =>
    new TextDecoder().decode(archive.subarray(from, to));
  if (ascii(0, 8) !== "!<arch>\n") throw new Error("Not an ar archive");

  const stats: RetagStats = { objects: 0, retagged: 0, neutralized: 0 };
  let offset = 8;
  while (offset + 60 <= archive.length) {
    const name = ascii(offset, offset + 16).trim();
    const size = Number.parseInt(ascii(offset + 48, offset + 58).trim(), 10);
    let body = offset + 60;
    // BSD long names ("#1/<length>") sit at the start of the member body.
    if (name.startsWith("#1/")) body += Number.parseInt(name.slice(3), 10);

    if (
      body + 32 <= archive.length &&
      view.getUint32(body, true) === MH_MAGIC_64
    ) {
      stats.objects += 1;
      const ncmds = view.getUint32(body + 16, true);
      let cmd = body + 32;
      for (let i = 0; i < ncmds; i++) {
        const type = view.getUint32(cmd, true);
        if (
          type === LC_BUILD_VERSION &&
          view.getUint32(cmd + 8, true) === PLATFORM_IOS
        ) {
          view.setUint32(cmd + 8, PLATFORM_MACCATALYST, true);
          if (view.getUint32(cmd + 12, true) < CATALYST_MIN_VERSION) {
            view.setUint32(cmd + 12, CATALYST_MIN_VERSION, true);
          }
          stats.retagged += 1;
        } else if (type === LC_VERSION_MIN_IPHONEOS) {
          view.setUint32(cmd, LC_SOURCE_VERSION, true);
          stats.neutralized += 1;
        }
        cmd += view.getUint32(cmd + 4, true);
      }
    }

    offset += 60 + size;
    if (offset % 2) offset += 1;
  }
  return stats;
};
