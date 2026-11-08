import {
  defaultRequestServer,
  requestServers,
  selectRequestServer,
} from "./servers";
import type { ServiceCommonServer } from "./types";

const server = (
  id: number,
  is4k: boolean,
  isDefault: boolean,
): ServiceCommonServer => ({ id, name: `radarr-${id}`, is4k, isDefault });

describe("requestServers", () => {
  // Seerr flags a default per group, and lists the 4K one first here.
  const services = [server(1, true, true), server(2, false, true)];

  test("keeps a regular request off the 4K server", () => {
    const servers = requestServers(services, false);
    expect(servers.map((s) => s.id)).toEqual([2]);
    expect(defaultRequestServer(servers)?.id).toBe(2);
  });

  test("keeps a 4K request on the 4K servers", () => {
    expect(requestServers(services, true).map((s) => s.id)).toEqual([1]);
  });

  test("lists none before the services load", () => {
    expect(requestServers(undefined, false)).toEqual([]);
  });
});

describe("defaultRequestServer", () => {
  test("takes the server flagged default", () => {
    expect(
      defaultRequestServer([server(3, false, false), server(4, false, true)])
        ?.id,
    ).toBe(4);
  });

  test("takes the first when none is flagged", () => {
    expect(defaultRequestServer([server(5, false, false)])?.id).toBe(5);
  });

  test("has none to take from an empty list", () => {
    expect(defaultRequestServer([])).toBeUndefined();
  });
});

describe("selectRequestServer", () => {
  test("drops what was picked for the last server, keeps the rest", () => {
    const next = selectRequestServer(
      {
        serverId: 1,
        profileId: 4,
        rootFolder: "/movies",
        tags: [2],
        userId: 9,
      },
      2,
    );
    expect(next).toEqual({ serverId: 2, userId: 9 });
    // Absent, not undefined: the new server's defaults survive the spread
    // into the request body.
    expect("profileId" in next).toBe(false);
  });
});
