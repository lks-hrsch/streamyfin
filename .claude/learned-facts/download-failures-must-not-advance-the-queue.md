# Download Failures Must Not Advance the Queue

**Date**: 2026-10-08
**Category**: native-modules
**Key files**: `modules/background-downloader/ios/DownloadRetryPolicy.swift`, `modules/background-downloader/ios/BackgroundDownloaderModule.swift`

## Detail

The iOS queue runs one download at a time and starts the next one when a download fails. When
every failure was final, a network outage emptied a whole season's queue in seconds: each item
failed at once and the next one started straight into the same outage. A server reached through a
VPN (NetBird) behind a public gateway shows this most clearly. While the tunnel is down the name
resolves to the public address, and the gateway answers **403** to every request, logged as
`HTTP error: 403` about 250 ms apart.

Transient failures (`DownloadRetryPolicy.isTransient`) now replace the task in place. The new
task gets `earliestBeginDate` for the backoff, so no timer has to survive suspension, and resume
data when the server allows range requests. The failed item's slot stays occupied, so the queue
waits instead of draining. Two rules keep this from looping:

- The retry budget resets only on progress from a **2xx** response. An error page streams bytes
  too, and must not refill the budget.
- A cancel is final only if it came from our own cancel functions (`userCancelledTaskIds`). A
  cancel that carries `NSURLErrorBackgroundTaskCancelledReasonKey` comes from the system (force
  quit, resource pressure) and is retried.
