import { retagArchiveForCatalyst } from "./machORetag";

const LC_BUILD_VERSION = 0x32;
const LC_VERSION_MIN_IPHONEOS = 0x25;
const LC_SOURCE_VERSION = 0x2a;

/** A 64-bit Mach-O object holding just the given load commands. */
const machO = (commands: Uint8Array[]) => {
  const size = commands.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(32 + size);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0xfeedfacf, true);
  view.setUint32(16, commands.length, true);
  view.setUint32(20, size, true);
  let offset = 32;
  for (const command of commands) {
    out.set(command, offset);
    offset += command.length;
  }
  return out;
};

const buildVersion = (platform: number, minos: number) => {
  const cmd = new Uint8Array(24);
  const view = new DataView(cmd.buffer);
  view.setUint32(0, LC_BUILD_VERSION, true);
  view.setUint32(4, 24, true);
  view.setUint32(8, platform, true);
  view.setUint32(12, minos, true);
  view.setUint32(16, 17 << 16, true);
  return cmd;
};

const versionMinIphoneos = () => {
  const cmd = new Uint8Array(16);
  const view = new DataView(cmd.buffer);
  view.setUint32(0, LC_VERSION_MIN_IPHONEOS, true);
  view.setUint32(4, 16, true);
  view.setUint32(8, 13 << 16, true);
  return cmd;
};

/**
 * A BSD ar archive, long member names stored the way ar does, with where each
 * member's object starts.
 */
const archive = (members: { name: string; body: Uint8Array }[]) => {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [encoder.encode("!<arch>\n")];
  const bodies: number[] = [];
  let position = 8;
  for (const { name, body } of members) {
    const long = name.length > 16;
    const nameBytes = encoder.encode(name);
    const payload = long ? new Uint8Array([...nameBytes, ...body]) : body;
    const field = (value: string, width: number) => value.padEnd(width, " ");
    const header =
      field(long ? `#1/${nameBytes.length}` : name, 16) +
      field("0", 12) +
      field("0", 6) +
      field("0", 6) +
      field("644", 8) +
      field(String(payload.length), 10) +
      "`\n";
    parts.push(encoder.encode(header), payload);
    bodies.push(position + 60 + (long ? nameBytes.length : 0));
    position += 60 + payload.length;
    if (payload.length % 2) {
      parts.push(encoder.encode("\n"));
      position += 1;
    }
  }
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return { bytes: out, bodies };
};

const commandAt = (buffer: Uint8Array, index: number) =>
  new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getUint32(
    index,
    true,
  );

describe("retagArchiveForCatalyst", () => {
  test("moves iOS objects to Catalyst and neutralizes iOS-only minimums", () => {
    const iosObject = machO([buildVersion(2, 13 << 16)]);
    const rustObject = machO([versionMinIphoneos()]);
    const { bytes: ar, bodies } = archive([
      { name: "a.o", body: iosObject },
      { name: "dovi-1234.dovi.cgu.00.rcgu.o", body: rustObject },
    ]);

    const stats = retagArchiveForCatalyst(ar);

    expect(stats).toEqual({ objects: 2, retagged: 1, neutralized: 1 });
    // platform → MACCATALYST (6), minimum raised to 14.0
    expect(commandAt(ar, bodies[0] + 32 + 8)).toBe(6);
    expect(commandAt(ar, bodies[0] + 32 + 12)).toBe(14 << 16);
    expect(commandAt(ar, bodies[1] + 32)).toBe(LC_SOURCE_VERSION);
  });

  test("keeps a minimum that is already high enough", () => {
    const { bytes: ar, bodies } = archive([
      { name: "b.o", body: machO([buildVersion(2, 16 << 16)]) },
    ]);
    retagArchiveForCatalyst(ar);
    expect(commandAt(ar, bodies[0] + 32 + 12)).toBe(16 << 16);
  });

  test("leaves objects for other platforms alone", () => {
    const { bytes: ar, bodies } = archive([
      { name: "c.o", body: machO([buildVersion(1, 0)]) },
    ]);
    expect(retagArchiveForCatalyst(ar).retagged).toBe(0);
    expect(commandAt(ar, bodies[0] + 32 + 8)).toBe(1);
  });

  test("rejects anything that is not an ar archive", () => {
    expect(() => retagArchiveForCatalyst(new Uint8Array(16))).toThrow(
      "Not an ar archive",
    );
  });
});
