# Jellyfin's Id Query Skips the User's Library Access

**Date**: 2026-11-23
**Category**: state-and-data
**Key files**: `utils/seerr/librarySearch.ts` (`fetchLibraryItem`), `hooks/useSeerrLibraryMatches.ts`, `app/(auth)/(tabs)/(search)/index.tsx`

## Detail

`GET /Items?ids=…&userId=…` returns an item of a library the user may not open. `LibraryManager.AddUserToQuery` restricts a query to the user's libraries (`TopParentIds`) only when it names no `ItemIds`, and `folder.GetItems` checks nothing more for an id. Replayed against Jellyfin 12.2 on the local test server, with a user allowed the Shows library only: `/Items?ids=<The Matrix>,<Game of Thrones>` listed both, with and without `recursive=true`.

`GET /Items/{id}?userId=…` checks the whole visibility (`GetItemById(id, user)` → `IsVisibleStandalone`: parental rating, tags, the library folders) and answers 404 for The Matrix, 200 for Game of Thrones. A text search (`searchTerm`) keeps to the user's libraries too: `matrix` found nothing for that user.

So an id that comes from outside the user's own answers, one Seerr, Streamystats or Marlin holds, since they index every library, is looked up one at a time with `GET /Items/{id}`, where a 404 means "not for this user". Ids the server gave this user (an item page, a watchlist of theirs) can still go through `ids=`.

## Symptom pattern

A search, a row or a recommendation shows a title from a library the signed-in user has no access to (a child's account seeing a grown-up library), and opening it lands on an error or an empty page, since the item page asks `GET /Items/{id}` and gets the 404. The Streamystats and Marlin search engines (`searchFn` in the search screen) still resolve their ids through `ids=`.
