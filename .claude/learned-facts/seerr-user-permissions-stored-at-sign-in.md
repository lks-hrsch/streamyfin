# The App's Seerr Permissions Are the Ones It Signed In With

**Date**: 2026-11-14
**Category**: state-and-data
**Key files**: `hooks/useSeerr.ts` (`seerrUserAtom`), `components/seerr/SeerrAutoLogin.tsx`, `components/settings/Seerr.tsx`

## Detail

`seerrUserAtom` is read from MMKV (`SEERR_USER_STORAGE_KEY`) and written only when the app signs in to Seerr: the settings screen's sign in, or `SeerrAutoLogin`, which does nothing while a user is stored (`if (seerrUser) return`). Nothing reads `/auth/me` again afterwards. A permission granted or taken on Seerr (Manage Requests, Create Issues) therefore reaches the app only after a new sign in, and every permission gate (`hasPermission(..., seerrUser.permissions)`, the approve and decline buttons, the issue button, the request offer) keeps answering from the old value.

Deleting the Seerr session cookie does not force that sign in when the plugin hands the app an API key: the client then acts as the stored user (`api.actAsUserId`) and never gets a 401.

To test a permission change on a device: Settings > Plugins > Seerr > Reset Seerr config on the phone, or sign out of Jellyfin and back in on the TV (a sign out clears the Seerr data). Both make `SeerrAutoLogin` sign in again with the new permissions.
