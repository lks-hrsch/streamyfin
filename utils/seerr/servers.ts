import type { MediaRequestBody, ServiceCommonServer } from "./types";

/**
 * The Radarr or Sonarr servers a request may go to. Seerr lists 4K and
 * regular servers together and flags a default in each group, so a plain
 * `find(isDefault)` can hand a regular request to the 4K server. Scoped the
 * way Seerr's own request dialog scopes them.
 */
export const requestServers = (
  services: ServiceCommonServer[] | undefined,
  is4k: boolean,
): ServiceCommonServer[] =>
  services?.filter((server) => server.is4k === is4k) ?? [];

/**
 * The server Seerr itself would pick: the group's default, else its first.
 * Seerr only sends a request on to a server flagged default, but the first is
 * still the better one to show than none at all.
 */
export const defaultRequestServer = (
  servers: ServiceCommonServer[],
): ServiceCommonServer | undefined =>
  servers.find((server) => server.isDefault) ?? servers[0];

/**
 * Points the pending request at another server. Quality profile ids, root
 * folder paths and tag ids belong to one server, so the ones picked for the
 * last are dropped. Dropped, not set to undefined: the request body spreads
 * these overrides over the server's defaults, and a key holding undefined
 * would still win that spread and send no profile at all.
 */
export const selectRequestServer = <T extends Partial<MediaRequestBody>>(
  overrides: T,
  serverId: number,
): T => {
  const { profileId: _, rootFolder: __, tags: ___, ...rest } = overrides;
  return { ...rest, serverId } as T;
};
