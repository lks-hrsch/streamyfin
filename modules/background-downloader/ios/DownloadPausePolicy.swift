import Foundation

/// Decides whether a failed transfer pauses, to go on once the connection is back, or fails.
///
/// Downloads are long and the network under them is not: Wi-Fi hand-offs, a VPN tunnel that drops
/// for a minute, a server restarting. Before this every such blip was terminal, and because the
/// queue advances on failure, one outage emptied a whole season's queue within seconds: each item
/// failed instantly in turn. An interrupted download now pauses instead, keeping its place at the
/// head of the queue, and goes on when the network changes, the app comes back to the foreground,
/// or the user resumes it.
///
/// Pure and dependency-free so it can be exercised outside the app.
enum DownloadPausePolicy {
  /// Domain of the errors the session delegate synthesizes for non-2xx responses; the code is the
  /// HTTP status.
  static let httpErrorDomain = "BackgroundDownloader"

  private static let connectionURLErrorCodes: Set<Int> = [
    NSURLErrorTimedOut,
    NSURLErrorCannotFindHost,
    NSURLErrorCannotConnectToHost,
    NSURLErrorNetworkConnectionLost,
    NSURLErrorDNSLookupFailed,
    NSURLErrorResourceUnavailable,
    NSURLErrorNotConnectedToInternet,
    NSURLErrorBadServerResponse,
    NSURLErrorInternationalRoamingOff,
    NSURLErrorCallIsActive,
    NSURLErrorDataNotAllowed,
    NSURLErrorSecureConnectionFailed,
    NSURLErrorCannotLoadFromNetwork,
    NSURLErrorBackgroundSessionWasDisconnected,
  ]

  /// 403 is normally final, but an access gateway in front of the server (VPN-only allowlists,
  /// reverse proxies) answers 403 for as long as the tunnel is down. The user was already allowed
  /// to start this download, so a 403 mid-queue is far more likely the gateway than a revoked
  /// permission, and a paused download can still be cancelled.
  private static let connectionHTTPStatuses: Set<Int> = [403, 408, 425, 429, 500, 502, 503, 504]

  static func shouldPause(_ error: Error) -> Bool {
    let nsError = error as NSError
    switch nsError.domain {
    case NSURLErrorDomain:
      if nsError.code == NSURLErrorCancelled {
        // Only the system attaches a cancellation reason (force quit, resource pressure,
        // background updates off). A cancel without one came from our own cancel calls.
        return nsError.userInfo[NSURLErrorBackgroundTaskCancelledReasonKey] != nil
      }
      return connectionURLErrorCodes.contains(nsError.code)
    case NSPOSIXErrorDomain:
      // Socket-level failures (connection reset, broken pipe) that surface unwrapped.
      return true
    case httpErrorDomain:
      return connectionHTTPStatuses.contains(nsError.code)
    default:
      return false
    }
  }
}
