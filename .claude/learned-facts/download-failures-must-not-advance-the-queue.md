# Download Failures Must Not Advance the Queue

**Date**: 2026-10-15
**Category**: native-modules
**Key files**: `modules/background-downloader/ios/DownloadPausePolicy.swift`, `modules/background-downloader/ios/BackgroundDownloaderModule.swift`, `providers/Downloads/hooks/useDownloadEventHandlers.ts`

## Detail

The iOS queue runs one download at a time and starts the next one when a download fails. When
every failure was final, a network outage emptied a whole season's queue in seconds: each item
failed at once and the next one started straight into the same outage. A server reached through a
VPN (NetBird) behind a public gateway shows this most clearly. While the tunnel is down the name
resolves to the public address, and the gateway answers **403** to every request, logged as
`HTTP error: 403` about 250 ms apart.

An interrupted download (`DownloadPausePolicy.shouldPause`) now **pauses** instead. Its task is
gone, but its entry stays in the task map under the dead task's id with `pausedAt` set, and its
resume data (range requests, so direct downloads only) goes to a file. The entry keeps the queue's
single slot, so the queue waits instead of draining. It goes on, under a new task, on:

- a network path change (`NWPathMonitor`): a connection coming back, or a VPN tunnel coming up,
  which changes the path without changing whether there is one. The monitor's first update at
  launch resumes what an earlier run left paused;
- the app entering the foreground: a server answering 5xx changes nothing about the network;
- the user's resume button on the download card.

No timer and no attempt counter: a download that is still refused pauses again, so nothing loops
between those events. Three rules keep it correct:

- A paused download is cancelled by its task id, never by URL like a queued one: by URL it stayed
  in the slot and the queue never moved again.
- An error response streams a body too; progress from a non-2xx response is ignored.
- A cancel is final only if it came from our own cancel functions (`userCancelledTaskIds`). A
  cancel that carries `NSURLErrorBackgroundTaskCancelledReasonKey` comes from the system (force
  quit, resource pressure) and pauses.
