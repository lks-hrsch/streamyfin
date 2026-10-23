# Local test server

A disposable Jellyfin + Seerr pair with fixed test data, for screenshots, recordings and
manual checks. Every PR screenshot is taken here, signed in as the test user, so before and
after show the same data and no image carries a personal server or account (see
[AGENTS.md](../../AGENTS.md)). Nothing here runs in CI.

Prerequisites: Docker (or Podman with `docker compose`), Python 3. FFmpeg comes from the
Jellyfin image.

```sh
python3 e2e/test-server/setup.py
```

The script starts Jellyfin 12.2, Seerr 3.5.0 and a stand-in for the Streamyfin Jellyfin
plugin, finishes both onboardings, generates a 90 second test clip and files it under the
titles below, creates the test user and imports it into Seerr. It binds to the loopback
interface only and is safe to rerun.

- **Server for the app**: <http://127.0.0.1:18196> (`TEST_SERVER_PORT`). This is the plugin
  stand-in: it serves `/Streamyfin/config` with the Seerr address and passes everything else
  to Jellyfin, so the app sets Seerr up the way it does against a real server with the plugin.
- **Test user**: `streamyfin-test`, password `Streamyfin-local-2026`. Not an administrator;
  in Seerr it may request and report issues, like a regular user.
- **Seerr**: <http://127.0.0.1:15155> (`TEST_SEERR_PORT`). The app gets this address from the
  plugin config.
- **Admin**: `admin` / `Streamyfin-admin-2026`, only for setting things up. Screenshots never
  use it.
- Tokens and the Seerr API key: `.state/credentials.json`. Config, cache and media: `.state/`,
  gitignored. The credentials belong to this throwaway server and nothing else.

## Test data

The clip is a generated test pattern; the titles only make Jellyfin and Seerr fetch real
metadata, artwork and TMDB ids.

| Library | Holds | Leaves missing, for the Seerr features to show |
| --- | --- | --- |
| Movies | Big Buck Bunny, The Matrix, The Matrix Reloaded | The Matrix Revolutions and Resurrections |
| Shows | Game of Thrones S01E01 and S02E01 | Seasons 3 to 8, and the rest of 1 and 2 |
| Collections | The Matrix Collection (TMDB 2344) | Its two other films |

Seerr's own libraries stay off: Seerr 3.5.0's request validator refuses the documented
`sync`/`enable` parameters of `/settings/jellyfin/library`. Streamyfin reads what the library
holds from Jellyfin, so nothing depends on them.

## Reaching it from a device

- iOS simulator, tvOS simulator, the Mac: `http://127.0.0.1:18196` as is.
- Android emulator: `adb reverse tcp:18196 tcp:18196` and `adb reverse tcp:15155 tcp:15155`.
- A physical device: start with `TEST_SERVER_BIND=0.0.0.0 TEST_SERVER_HOST=<this machine's LAN
  address>`, then use that address.

## Teardown

```sh
docker compose -f e2e/test-server/compose.yml down
```

Delete `e2e/test-server/.state/` to start from an empty server.
