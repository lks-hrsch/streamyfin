import Foundation

/// Decides whether a failed transfer gets another attempt, and when.
///
/// Downloads are long and the network under them is not: Wi-Fi hand-offs, a VPN tunnel that drops
/// for a minute, a server restarting. Before this policy every such blip was terminal, and because
/// the queue advances on failure, one outage emptied a whole season's queue within seconds — each
/// item failing instantly in turn. Transient failures now retry in place with backoff, which also
/// keeps the queue parked behind the item until the network is back.
///
/// Pure and dependency-free so it can be exercised outside the app.
enum DownloadRetryPolicy {
  /// Domain of the errors the session delegate synthesizes for non-2xx responses; the code is the
  /// HTTP status.
  static let httpErrorDomain = "BackgroundDownloader"

  /// Consecutive failed attempts before the download is reported as failed. Reset whenever the
  /// transfer makes progress again, so a long download survives any number of separate blips.
  /// With the delays below this is roughly 40 minutes of trying.
  static let maxAttempts = 12

  static let baseDelay: TimeInterval = 5
  static let maxDelay: TimeInterval = 300

  private static let transientURLErrorCodes: Set<Int> = [
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
  /// permission — and the attempt budget bounds the cost of being wrong.
  private static let transientHTTPStatuses: Set<Int> = [403, 408, 425, 429, 500, 502, 503, 504]

  static func isTransient(_ error: Error) -> Bool {
    let nsError = error as NSError
    switch nsError.domain {
    case NSURLErrorDomain:
      if nsError.code == NSURLErrorCancelled {
        // Only the system attaches a cancellation reason (force quit, resource pressure,
        // background updates off). A cancel without one came from our own cancel calls.
        return nsError.userInfo[NSURLErrorBackgroundTaskCancelledReasonKey] != nil
      }
      return transientURLErrorCodes.contains(nsError.code)
    case NSPOSIXErrorDomain:
      // Socket-level failures (connection reset, broken pipe) that surface unwrapped.
      return true
    case httpErrorDomain:
      return transientHTTPStatuses.contains(nsError.code)
    default:
      return false
    }
  }

  /// `attempt` is 1-based: the delay before the first retry is `baseDelay`.
  static func delay(forAttempt attempt: Int) -> TimeInterval {
    let exponent = Double(max(attempt, 1) - 1)
    return min(baseDelay * pow(2, exponent), maxDelay)
  }

  static func shouldRetry(attempt: Int) -> Bool {
    attempt <= maxAttempts
  }
}
