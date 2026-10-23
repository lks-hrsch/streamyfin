#!/usr/bin/env python3
"""Start the local Jellyfin + Seerr test server and fill it with test data."""

import http.cookiejar
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent
STATE = ROOT / ".state"
MEDIA = STATE / "media"
JELLYFIN = f"http://127.0.0.1:{os.environ.get('TEST_SERVER_PORT', '18196')}"
SEERR = f"http://127.0.0.1:{os.environ.get('TEST_SEERR_PORT', '15155')}/api/v1"
JELLYFIN_CONTAINER = "streamyfin-test-jellyfin"

ADMIN = ("admin", "Streamyfin-admin-2026")
TEST_USER = ("streamyfin-test", "Streamyfin-local-2026")
AUTH = 'MediaBrowser Client="Test server setup", Device="Local", DeviceId="test-server-setup", Version="1.0"'

# Seerr permissions: REQUEST (32) + CREATE_ISSUES (4194304), what a regular user has.
TEST_USER_SEERR_PERMISSIONS = 32 + 4194304

# Generated test pattern clips, named after titles TMDB knows so the servers
# fetch real metadata, artwork and provider ids. The library holds one episode
# each of two seasons of a series, and two films of a three-film collection, so
# the Seerr features have something missing to show.
MOVIES = ["Big Buck Bunny (2008)", "The Matrix (1999)", "The Matrix Reloaded (2003)"]
EPISODES = {
    "Game of Thrones (2011)": [("Season 01", "S01E01"), ("Season 02", "S02E01")],
}
COLLECTION = ("The Matrix Collection", ["The Matrix", "The Matrix Reloaded"])


def request(url, method="GET", data=None, headers=None, opener=None):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, body, {"Content-Type": "application/json", **(headers or {})}, method=method)
    with (opener or urllib.request.build_opener()).open(req, timeout=60) as response:
        result = response.read()
        try:
            return json.loads(result) if result else None
        except ValueError:
            return result.decode()


def jellyfin(path, method="GET", data=None, token=None):
    auth = AUTH + (f', Token="{token}"' if token else "")
    return request(JELLYFIN + path, method, data, {"Authorization": auth})


def wait(what, check, attempts=90, delay=2):
    for _ in range(attempts):
        try:
            if check():
                return
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            # Not up yet, or the plugin stand-in answering for a Jellyfin that
            # is still starting.
            pass
        time.sleep(delay)
    raise RuntimeError(f"{what} did not become ready")


def start():
    for name in ("jellyfin-config", "jellyfin-cache", "seerr-config", "media/movies", "media/shows"):
        (STATE / name).mkdir(parents=True, exist_ok=True)
    subprocess.run(["docker", "compose", "-f", str(ROOT / "compose.yml"), "up", "-d"], check=True)
    wait("Jellyfin", lambda: jellyfin("/System/Info/Public")["Id"])


def generate_media():
    clip = MEDIA / "movies" / MOVIES[0] / f"{MOVIES[0]}.mkv"
    if not clip.exists() or clip.stat().st_size == 0:
        clip.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run([
            "docker", "exec", JELLYFIN_CONTAINER, "/usr/lib/jellyfin-ffmpeg/ffmpeg",
            "-hide_banner", "-loglevel", "error", "-y",
            "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=24",
            "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
            "-t", "90", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k", "-shortest",
            f"/media/movies/{MOVIES[0]}/{MOVIES[0]}.mkv",
        ], check=True)
    # Every other title is a hard link to the same clip: no extra space.
    targets = [MEDIA / "movies" / m / f"{m}.mkv" for m in MOVIES[1:]]
    for show, episodes in EPISODES.items():
        name = show.split(" (")[0]
        targets += [MEDIA / "shows" / show / season / f"{name} - {episode}.mkv" for season, episode in episodes]
    for target in targets:
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            os.link(clip, target)


def onboard_jellyfin():
    if not jellyfin("/System/Info/Public").get("StartupWizardCompleted"):
        jellyfin("/Startup/Configuration", "POST", {"UICulture": "en-US", "MetadataCountryCode": "US", "PreferredMetadataLanguage": "en"})
        jellyfin("/Startup/User")
        jellyfin("/Startup/User", "POST", {"Name": ADMIN[0], "Password": ADMIN[1]})
        jellyfin("/Startup/RemoteAccess", "POST", {"EnableRemoteAccess": True, "EnableAutomaticPortMapping": False})
        jellyfin("/Startup/Complete", "POST")
    session = jellyfin("/Users/AuthenticateByName", "POST", {"Username": ADMIN[0], "Pw": ADMIN[1]})
    token = session["AccessToken"]

    folders = {f["Name"] for f in jellyfin("/Library/VirtualFolders", token=token)}
    for name, kind, path in (("Movies", "movies", "/media/movies"), ("Shows", "tvshows", "/media/shows")):
        if name not in folders:
            query = urllib.parse.urlencode({"name": name, "collectionType": kind, "paths": path, "refreshLibrary": "false"})
            jellyfin(f"/Library/VirtualFolders?{query}", "POST", {"LibraryOptions": {}}, token)
    jellyfin("/Library/Refresh", "POST", token=token)

    users = {u["Name"]: u["Id"] for u in jellyfin("/Users", token=token)}
    if TEST_USER[0] not in users:
        users[TEST_USER[0]] = jellyfin("/Users/New", "POST", {"Name": TEST_USER[0], "Password": TEST_USER[1]}, token)["Id"]
    return token, session["User"]["Id"], users[TEST_USER[0]]


def items(token, user_id, kinds):
    query = urllib.parse.urlencode({"userId": user_id, "Recursive": "true", "IncludeItemTypes": kinds, "Fields": "ProviderIds"})
    return jellyfin(f"/Items?{query}", token=token)["Items"]


def wait_for_library(token, user_id):
    def scanned():
        found = items(token, user_id, "Movie,Series")
        return len(found) >= len(MOVIES) + len(EPISODES) and all(i.get("ProviderIds", {}).get("Tmdb") for i in found)

    wait("The library scan", scanned, attempts=120, delay=3)


def create_collection(token, user_id):
    name, titles = COLLECTION
    if any(i["Name"] == name for i in items(token, user_id, "BoxSet")):
        return
    ids = [i["Id"] for i in items(token, user_id, "Movie") if i["Name"] in titles]
    query = urllib.parse.urlencode({"name": name, "ids": ",".join(ids)})
    box = jellyfin(f"/Collections?{query}", "POST", token=token)
    jellyfin(f"/Items/{box['Id']}/Refresh?metadataRefreshMode=FullRefresh&replaceAllMetadata=true", "POST", token=token)
    # The collection's TMDB id is what the Seerr collection row looks up.
    wait("The collection's metadata", lambda: jellyfin(f"/Items/{box['Id']}?userId={user_id}", token=token).get("ProviderIds", {}).get("Tmdb"))


def set_up_seerr(test_user_id):
    wait("Seerr", lambda: request(f"{SEERR}/status").get("version"))
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    def seerr(path, method="GET", data=None):
        return request(SEERR + path, method, data, opener=opener)

    if not request(f"{SEERR}/settings/public").get("initialized"):
        try:
            seerr("/auth/jellyfin", "POST", {
                "username": ADMIN[0], "password": ADMIN[1], "hostname": "jellyfin", "port": 8096,
                "useSsl": False, "urlBase": "", "email": "admin@example.com", "serverType": 2,
            })
        except urllib.error.HTTPError:
            # A previous run got as far as pointing Seerr at Jellyfin, which
            # Seerr refuses to do twice; signing in is all that is left.
            seerr("/auth/jellyfin", "POST", {"username": ADMIN[0], "password": ADMIN[1]})
        # Seerr 3.5.0's request validator refuses the documented sync/enable
        # parameters of this route, so its libraries stay off. Nothing here
        # needs them: Streamyfin reads what the library holds from Jellyfin.
        try:
            libraries = seerr("/settings/jellyfin/library?sync=true")
            seerr("/settings/jellyfin/library?enable=" + ",".join(l["id"] for l in libraries))
        except urllib.error.HTTPError:
            pass
        seerr("/settings/initialize", "POST")
    else:
        seerr("/auth/jellyfin", "POST", {"username": ADMIN[0], "password": ADMIN[1]})

    seerr_users = seerr("/user?take=100")["results"]
    test = next((u for u in seerr_users if u.get("jellyfinUserId") == test_user_id), None)
    if test is None:
        test = seerr("/user/import-from-jellyfin", "POST", {"jellyfinUserIds": [test_user_id]})[0]
    seerr(f"/user/{test['id']}/settings/permissions", "POST", {"permissions": TEST_USER_SEERR_PERMISSIONS})
    return seerr("/settings/main")["apiKey"]


def main():
    start()
    generate_media()
    token, admin_id, test_user_id = onboard_jellyfin()
    wait_for_library(token, admin_id)
    create_collection(token, admin_id)
    seerr_key = set_up_seerr(test_user_id)
    (STATE / "credentials.json").write_text(json.dumps({
        "server": JELLYFIN,
        "seerr": SEERR.removesuffix("/api/v1"),
        "testUser": {"name": TEST_USER[0], "password": TEST_USER[1], "id": test_user_id},
        "admin": {"name": ADMIN[0], "password": ADMIN[1], "token": token},
        "seerrApiKey": seerr_key,
    }, indent=2))
    print(f"Server for the app: {JELLYFIN}")
    print(f"Sign in as: {TEST_USER[0]} / {TEST_USER[1]}")
    print(f"Seerr: {SEERR.removesuffix('/api/v1')} (the app gets it from the plugin config)")


if __name__ == "__main__":
    main()
