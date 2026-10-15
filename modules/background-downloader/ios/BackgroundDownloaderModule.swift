import ExpoModulesCore
import Foundation
import os

/// Unified-log diagnostics for the background wake chain. `print` is invisible in release builds;
/// these lines are readable from Console.app or `log show` on an untethered device — the only way
/// to see whether iOS actually resumed the app for a background completion.
let backgroundDownloaderLog = Logger(
  subsystem: "com.fredrikburmester.streamyfin",
  category: "BackgroundDownloader"
)

enum DownloadError: Error {
  case invalidURL
  case fileOperationFailed
  case downloadFailed
}

/// Live Activity metadata handed down from JS at enqueue time. Entirely optional — a download
/// without it still works, it just never surfaces on the Lock Screen. All user-visible strings are
/// resolved in JS so translations stay single-sourced in `translations/*.json`.
struct DownloadMetadataRecord: Record {
  @Field var itemId: String = ""
  @Field var title: String = ""
  @Field var subtitle: String = ""
  @Field var posterFileName: String?
  @Field var estimatedTotalBytes: Double = 0
  @Field var labels: [String: String] = [:]

  func toMetadata() -> DownloadActivityMetadata {
    DownloadActivityMetadata(
      itemId: itemId,
      title: title,
      subtitle: subtitle,
      posterFileName: posterFileName,
      estimatedTotalBytes: Int64(max(estimatedTotalBytes, 0)),
      labels: labels
    )
  }
}

// Separate delegate class to handle URLSession callbacks
class DownloadSessionDelegate: NSObject, URLSessionDownloadDelegate {
  weak var module: BackgroundDownloaderModule?

  init(module: BackgroundDownloaderModule) {
    self.module = module
    super.init()
  }

  func urlSession(
    _ session: URLSession,
    downloadTask: URLSessionDownloadTask,
    didWriteData bytesWritten: Int64,
    totalBytesWritten: Int64,
    totalBytesExpectedToWrite: Int64
  ) {
    let statusCode = (downloadTask.response as? HTTPURLResponse)?.statusCode
    module?.handleProgress(
      taskId: downloadTask.taskIdentifier,
      bytesWritten: totalBytesWritten,
      totalBytes: totalBytesExpectedToWrite,
      isSuccessResponse: statusCode.map { (200...299).contains($0) } ?? false
    )
  }

  func urlSession(
    _ session: URLSession,
    downloadTask: URLSessionDownloadTask,
    didFinishDownloadingTo location: URL
  ) {
    backgroundDownloaderLog.notice(
      "didFinishDownloadingTo delivered for task \(downloadTask.taskIdentifier)"
    )
    // A 401/404 still delivers a "finished" download - the body is the error
    // page. Treat any non-2xx as a failure so it is not saved as media.
    if let response = downloadTask.response as? HTTPURLResponse,
      !(200...299).contains(response.statusCode)
    {
      module?.handleError(
        taskId: downloadTask.taskIdentifier,
        error: NSError(
          domain: DownloadRetryPolicy.httpErrorDomain,
          code: response.statusCode,
          userInfo: [
            NSLocalizedDescriptionKey: "HTTP error: \(response.statusCode)"
          ]
        )
      )
      return
    }
    module?.handleDownloadComplete(
      taskId: downloadTask.taskIdentifier,
      location: location,
      downloadTask: downloadTask
    )
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didCompleteWithError error: Error?
  ) {
    if let error = error {
      let nsError = error as NSError
      backgroundDownloaderLog.error(
        "Task \(task.taskIdentifier) failed: \(nsError.domain, privacy: .public) code \(nsError.code)"
      )
      module?.handleError(taskId: task.taskIdentifier, error: error)
    }
  }

  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    backgroundDownloaderLog.notice("All background session events delivered")
    DispatchQueue.main.async {
      if let completion = BackgroundDownloaderModule.backgroundCompletionHandler {
        backgroundDownloaderLog.notice("Calling stored background completion handler")
        completion()
        BackgroundDownloaderModule.backgroundCompletionHandler = nil
      } else {
        backgroundDownloaderLog.notice(
          "No background completion handler stored (foreground delivery)"
        )
      }
    }
  }
}

public class BackgroundDownloaderModule: Module {
  fileprivate static var backgroundCompletionHandler: (() -> Void)?

  /// Confines every piece of mutable download state below. The module is entered from several
  /// unrelated execution contexts — Expo function bodies, the URLSession delegate queue, and
  /// `getAllTasks` completion handlers — and plain Swift collections must never be touched from two
  /// of them at once. Methods suffixed `Locked` assume they are already running on this queue and
  /// must not be called from anywhere else.
  private let stateQueue = DispatchQueue(
    label: "com.fredrikburmester.streamyfin.backgrounddownloader.state"
  )
  private var session: URLSession?
  private var sessionDelegate: DownloadSessionDelegate?
  private var downloadTasks: [Int: DownloadTaskInfo] = [:]
  private var downloadQueue: [QueuedDownloadInfo] = []
  private var lastProgressTime: [Int: Date] = [:]
  /// Mirrors the JS `showDownloadLiveActivity` setting. Gates both the module's own activity
  /// (also gated inside the controller) and the continued-processing keeper, whose system UI is
  /// equally lock-screen download UI the user asked to turn off.
  private var downloadActivityUIEnabled = true
  /// Heartbeat throttle for the unified log — proves whether progress callbacks are being
  /// delivered while backgrounded without flooding the log.
  private var lastProgressLogTime = Date.distantPast
  private let taskStore = DownloadTaskStore()
  /// Tasks cancelled through our own cancel functions. Their cancellation error must end the
  /// download; any other failure of a known task goes through `DownloadRetryPolicy` first.
  private var userCancelledTaskIds: Set<Int> = []
  /// How long a restored task the session no longer lists gets to have its completion or failure
  /// delivered before it is treated as lost with the previous process and restarted.
  private static let orphanSweepDelay: TimeInterval = 30

  /// Mirrors `downloadTasks` into the App Group so a transfer that finishes after the app is
  /// terminated can still be resolved when iOS relaunches us.
  private func persistTasksLocked() {
    taskStore.save(downloadTasks)
  }

  public func definition() -> ModuleDefinition {
    Name("BackgroundDownloader")

    Events(
      "onDownloadProgress",
      "onDownloadComplete",
      "onDownloadError",
      "onDownloadStarted",
      "onDownloadRetrying"
    )

    OnCreate {
      self.stateQueue.sync {
        // Restore tasks left behind by a previous process before reconnecting to the session, so a
        // download that completed while we were dead can still be moved into place.
        self.downloadTasks = self.taskStore.load()
        self.downloadQueue = self.taskStore.loadQueue()
        backgroundDownloaderLog.notice(
          "Module created: restored \(self.downloadTasks.count) task(s), \(self.downloadQueue.count) queued"
        )
        self.initializeSessionLocked()
        self.scheduleOrphanSweepLocked()
        self.reconcileLiveActivitiesLocked()
        self.queueDidChangeLocked()
        // Re-arm a queue that outlived its process. No-op while a restored task is still
        // in flight; if that task is actually gone (force-quit cancels transfers), the session
        // delivers its cancellation error shortly after reconnecting, and handleError advances
        // the queue from there.
        self.processNextInQueueSafelyLocked()
      }
    }

    Function("setLiveActivityEnabled") { (enabled: Bool) in
      self.stateQueue.sync {
        self.downloadActivityUIEnabled = enabled
      }
      #if os(iOS)
        if #available(iOS 16.2, *) {
          DownloadLiveActivityController.shared.setEnabled(enabled)
        }
      #endif
      #if os(iOS) && compiler(>=6.2)
        // Turning the setting off must drop the system pill too, not just the card — finish a
        // keeper task that is already running. The transfer itself continues in the background
        // session; the process just suspends and the completion wake handles the rest.
        if #available(iOS 26.0, *), !enabled {
          DownloadContinuedProcessingKeeper.shared.finish()
        }
      #endif
    }

    /// Path of the App Group directory the widget extension can read. JS stages poster images here,
    /// since the extension has no access to the app's Documents directory.
    Function("getLiveActivityDirectory") { () -> String? in
      #if os(iOS)
        guard let directory = DownloadActivitySharedContainer.directory else { return nil }
        try? FileManager.default.createDirectory(
          at: directory,
          withIntermediateDirectories: true
        )
        return directory.path
      #else
        return nil
      #endif
    }

    AsyncFunction("startDownload") {
      (urlString: String, destinationPath: String?, metadata: DownloadMetadataRecord?,
        headers: [String: String]?) -> Int in
      try self.stateQueue.sync {
        try self.beginDownloadLocked(
          urlString: urlString,
          destinationPath: destinationPath,
          metadata: metadata?.toMetadata(),
          headers: headers
        )
      }
    }

    AsyncFunction("enqueueDownload") {
      (urlString: String, destinationPath: String?, metadata: DownloadMetadataRecord?,
        headers: [String: String]?) -> Int in
      try self.stateQueue.sync { () throws -> Int in
        let wasEmpty = self.downloadQueue.isEmpty
        self.downloadQueue.append(
          QueuedDownloadInfo(
            url: urlString,
            destinationPath: destinationPath,
            metadata: metadata?.toMetadata(),
            headers: headers
          )
        )
        self.queueDidChangeLocked()

        // If queue was empty and no active downloads, start processing immediately
        if wasEmpty {
          return try self.processNextInQueueLocked()
        }

        // Return placeholder taskId for queued items
        return -1
      }
    }

    Function("cancelDownload") { (taskId: Int) in
      self.cancelLiveActivity(taskId: taskId)
      let session = self.stateQueue.sync { self.session }
      session?.getAllTasks { tasks in
        let liveTask = tasks.first { $0.taskIdentifier == taskId }
        if let liveTask {
          // Marked before cancelling so the cancellation error is never mistaken for an
          // interruption and retried.
          self.stateQueue.sync { _ = self.userCancelledTaskIds.insert(taskId) }
          liveTask.cancel()
        }
        self.stateQueue.async {
          // Dropped even without a live task: a restored task awaiting the orphan sweep would
          // otherwise be restarted after the user cancelled it.
          guard self.downloadTasks.removeValue(forKey: taskId) != nil else { return }
          self.persistTasksLocked()
          if liveTask == nil {
            // No cancellation callback will come to advance the queue.
            self.processNextInQueueSafelyLocked()
          }
        }
      }
    }

    Function("cancelQueuedDownload") { (url: String) in
      // Remove from queue by URL
      self.stateQueue.sync {
        self.downloadQueue.removeAll { queuedItem in
          queuedItem.url == url
        }
        self.queueDidChangeLocked()
      }
    }

    Function("cancelAllDownloads") {
      self.cancelAllLiveActivities()
      // Clear the queue as well (Android already does) — otherwise the cancellation callbacks
      // would immediately start the next queued item, resurrecting what was just cancelled.
      let session = self.stateQueue.sync { () -> URLSession? in
        self.downloadQueue.removeAll()
        self.queueDidChangeLocked()
        return self.session
      }
      session?.getAllTasks { tasks in
        self.stateQueue.sync {
          self.userCancelledTaskIds.formUnion(tasks.map(\.taskIdentifier))
        }
        for task in tasks {
          task.cancel()
        }
        self.stateQueue.async {
          self.downloadTasks.removeAll()
          self.persistTasksLocked()
          self.finishContinuedProcessingIfIdleLocked()
        }
      }
    }

    AsyncFunction("getActiveDownloads") { () -> [[String: Any]] in
      return try await withCheckedThrowingContinuation { continuation in
        // Running and queued are snapshotted in one stateQueue block, so an item mid-transition
        // (dequeued and started) can never be missing from both lists.
        let (session, tasksSnapshot, queueSnapshot) = self.stateQueue.sync {
          (self.session, self.downloadTasks, self.downloadQueue)
        }

        let queuedDownloads = queueSnapshot.map { queued -> [String: Any] in
          var entry: [String: Any] = [
            "taskId": -1,
            "url": queued.url,
            "state": "queued"
          ]
          if let itemId = queued.metadata?.itemId {
            entry["itemId"] = itemId
          }
          if let destinationPath = queued.destinationPath {
            entry["destinationPath"] = destinationPath
          }
          return entry
        }

        guard let session else {
          continuation.resume(returning: queuedDownloads)
          return
        }

        session.getAllTasks { tasks in
          let runningEntry = { (taskId: Int, info: DownloadTaskInfo) -> [String: Any] in
            var entry: [String: Any] = [
              "taskId": taskId,
              "url": info.url,
              "state": "running"
            ]
            if let itemId = info.metadata?.itemId {
              entry["itemId"] = itemId
            }
            if let destinationPath = info.destinationPath {
              entry["destinationPath"] = destinationPath
            }
            return entry
          }

          let activeDownloads = tasks.compactMap { task -> [String: Any]? in
            guard task is URLSessionDownloadTask,
                  let info = tasksSnapshot[task.taskIdentifier] else {
              return nil
            }
            return runningEntry(task.taskIdentifier, info)
          }

          // A persisted task the session no longer lists is not lost: its completion or failure is
          // still being delivered, or the orphan sweep is about to restart it. Either way native
          // still owns it, and reporting it missing would make JS drop or duplicate the download.
          let liveIds = Set(tasks.map(\.taskIdentifier))
          let unresolvedDownloads = tasksSnapshot
            .filter { !liveIds.contains($0.key) }
            .map { runningEntry($0.key, $0.value) }

          continuation.resume(returning: activeDownloads + unresolvedDownloads + queuedDownloads)
        }
      }
    }
  }

  private func initializeSessionLocked() {
    let config = URLSessionConfiguration.background(
      withIdentifier: "com.fredrikburmester.streamyfin.backgrounddownloader"
    )
    config.allowsCellularAccess = true
    config.sessionSendsLaunchEvents = true
    config.isDiscretionary = false

    self.sessionDelegate = DownloadSessionDelegate(module: self)
    self.session = URLSession(
      configuration: config,
      delegate: self.sessionDelegate,
      delegateQueue: nil
    )

    backgroundDownloaderLog.notice("Background URLSession initialized")
  }

  private func makeRequest(urlString: String, headers: [String: String]?) -> URLRequest? {
    guard let url = URL(string: urlString) else { return nil }
    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    request.timeoutInterval = 300
    headers?.forEach { key, value in
      request.setValue(value, forHTTPHeaderField: key)
    }
    return request
  }

  /// Creates the URLSession task and all bookkeeping for one download. Shared by `startDownload`
  /// and the queue processor so the two can never drift apart again.
  private func beginDownloadLocked(
    urlString: String,
    destinationPath: String?,
    metadata: DownloadActivityMetadata?,
    headers: [String: String]? = nil
  ) throws -> Int {
    guard let request = makeRequest(urlString: urlString, headers: headers) else {
      throw DownloadError.invalidURL
    }

    if session == nil {
      initializeSessionLocked()
    }

    guard let session = self.session else {
      throw DownloadError.downloadFailed
    }

    let task = session.downloadTask(with: request)
    let taskId = task.taskIdentifier

    downloadTasks[taskId] = DownloadTaskInfo(
      url: urlString,
      destinationPath: destinationPath,
      metadata: metadata,
      headers: headers
    )
    persistTasksLocked()

    task.resume()

    backgroundDownloaderLog.notice(
      "Started download task \(taskId), \(self.downloadQueue.count) queued behind it"
    )

    startLiveActivity(taskId: taskId, metadata: metadata)
    startContinuedProcessingLocked(metadata: metadata)

    var payload: [String: Any] = [
      "taskId": taskId,
      "url": urlString
    ]
    if let itemId = metadata?.itemId {
      payload["itemId"] = itemId
    }
    sendEvent("onDownloadStarted", payload)

    return taskId
  }

  // MARK: - Delegate entry points
  // Called on the URLSession delegate queue; each hops onto stateQueue before touching state.

  func handleProgress(taskId: Int, bytesWritten: Int64, totalBytes: Int64, isSuccessResponse: Bool) {
    stateQueue.async {
      self.handleProgressLocked(
        taskId: taskId,
        bytesWritten: bytesWritten,
        totalBytes: totalBytes,
        isSuccessResponse: isSuccessResponse
      )
    }
  }

  func handleDownloadComplete(taskId: Int, location: URL, downloadTask: URLSessionDownloadTask) {
    // The temporary file at `location` is only valid until the delegate callback returns, so this
    // hop must be synchronous — the file is moved before control goes back to URLSession. Safe
    // because stateQueue never blocks on the delegate queue in return.
    stateQueue.sync {
      self.handleDownloadCompleteLocked(taskId: taskId, location: location, downloadTask: downloadTask)
    }
  }

  func handleError(taskId: Int, error: Error) {
    // Synchronous for the same reason as handleDownloadComplete: when a transfer fails while the
    // app is backgrounded, the next queued download must be created before the delegate queue
    // drains and urlSessionDidFinishEvents lets the system re-suspend the process. An async hop
    // here races that suspension.
    stateQueue.sync {
      self.handleErrorLocked(taskId: taskId, error: error)
    }
  }

  // MARK: - Handlers (stateQueue-confined)

  private func handleProgressLocked(
    taskId: Int,
    bytesWritten: Int64,
    totalBytes: Int64,
    isSuccessResponse: Bool
  ) {
    // An error response (a gateway's 403 page) streams a body too. It is not the download and ends
    // in a failure moment later, so it must neither show up as progress nor refill the retry budget
    // it is draining.
    guard isSuccessResponse else { return }

    let progress = totalBytes > 0
      ? Double(bytesWritten) / Double(totalBytes)
      : 0.0

    // Media flowing again ends the failure streak, so the budget only ever measures one outage.
    if downloadTasks[taskId]?.retryAttempt != nil {
      downloadTasks[taskId]?.retryAttempt = nil
      persistTasksLocked()
      backgroundDownloaderLog.notice("Task \(taskId) recovered; retry budget reset")
    }

    // Fed every callback, not just the throttled ones — the controller does its own rate limiting
    // and wants the finer samples for its speed average.
    updateLiveActivity(taskId: taskId, bytesWritten: bytesWritten, totalBytes: totalBytes)
    updateContinuedProcessingLocked(
      taskId: taskId,
      bytesWritten: bytesWritten,
      totalBytes: totalBytes
    )

    // Throttle progress updates: only send every 500ms
    let lastTime = lastProgressTime[taskId] ?? Date.distantPast
    let now = Date()
    let timeDiff = now.timeIntervalSince(lastTime)

    if now.timeIntervalSince(lastProgressLogTime) >= 10 {
      backgroundDownloaderLog.notice(
        "Progress delivering for task \(taskId): \(bytesWritten) / \(totalBytes) bytes"
      )
      lastProgressLogTime = now
    }

    // Send if 500ms passed
    if timeDiff >= 0.5 {
      var payload: [String: Any] = [
        "taskId": taskId,
        "bytesWritten": bytesWritten,
        "totalBytes": totalBytes,
        "progress": progress
      ]
      if let itemId = downloadTasks[taskId]?.metadata?.itemId {
        payload["itemId"] = itemId
      }
      sendEvent("onDownloadProgress", payload)

      lastProgressTime[taskId] = now
    }
  }

  private func handleDownloadCompleteLocked(
    taskId: Int,
    location: URL,
    downloadTask: URLSessionDownloadTask
  ) {
    guard let taskInfo = downloadTasks[taskId] else {
      backgroundDownloaderLog.error("Completion for task \(taskId) but no task info was found")
      finishLiveActivity(taskId: taskId, state: .failed)
      self.sendEvent("onDownloadError", [
        "taskId": taskId,
        "error": "Download task info not found"
      ])
      // A cancel that removed the task info before this callback ran is the usual way here. The
      // transfer finished, so no cancellation error follows for handleErrorLocked to advance the
      // queue from; without this the downloads queued behind it would wait for the next launch.
      lastProgressTime.removeValue(forKey: taskId)
      processNextInQueueSafelyLocked()
      return
    }

    // A non-2xx response still "completes" the transfer, but the file on disk
    // is the server's error body (auth page, JSON error), not the media.
    // Recording it as a successful download only fails much later, at
    // playback, so surface it as a download error here. (Android already
    // rejects these in OkHttpDownloadManager.)
    if let httpResponse = downloadTask.response as? HTTPURLResponse,
       !(200...299).contains(httpResponse.statusCode) {
      backgroundDownloaderLog.error(
        "Task \(taskId) finished with HTTP \(httpResponse.statusCode); treating as failure"
      )
      handleErrorLocked(
        taskId: taskId,
        error: NSError(
          domain: DownloadRetryPolicy.httpErrorDomain,
          code: httpResponse.statusCode,
          userInfo: [
            NSLocalizedDescriptionKey: "Server responded with HTTP \(httpResponse.statusCode)"
          ]
        )
      )
      return
    }

    let fileManager = FileManager.default

    do {
      let destinationURL: URL

      if let customPath = taskInfo.destinationPath {
        destinationURL = URL(fileURLWithPath: customPath)
      } else {
        let documentsDir = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first!
        let filename = downloadTask.response?.suggestedFilename
          ?? downloadTask.originalRequest?.url?.lastPathComponent
          ?? "download_\(taskId)"
        destinationURL = documentsDir.appendingPathComponent(filename)
      }

      if fileManager.fileExists(atPath: destinationURL.path) {
        try fileManager.removeItem(at: destinationURL)
      }

      let destinationDirectory = destinationURL.deletingLastPathComponent()
      if !fileManager.fileExists(atPath: destinationDirectory.path) {
        try fileManager.createDirectory(
          at: destinationDirectory,
          withIntermediateDirectories: true,
          attributes: nil
        )
      }

      try fileManager.moveItem(at: location, to: destinationURL)

      backgroundDownloaderLog.notice("Task \(taskId) completed; file moved into place")

      finishLiveActivity(taskId: taskId, state: .completed)

      var payload: [String: Any] = [
        "taskId": taskId,
        "filePath": destinationURL.path,
        "url": taskInfo.url
      ]
      if let itemId = taskInfo.metadata?.itemId {
        payload["itemId"] = itemId
      }
      sendEvent("onDownloadComplete", payload)

      downloadTasks.removeValue(forKey: taskId)
      lastProgressTime.removeValue(forKey: taskId)
      persistTasksLocked()

      processNextInQueueSafelyLocked()
    } catch {
      backgroundDownloaderLog.error(
        "Task \(taskId) file operation failed: \(error.localizedDescription, privacy: .public)"
      )
      finishLiveActivity(taskId: taskId, state: .failed)

      var payload: [String: Any] = [
        "taskId": taskId,
        "error": "File operation failed: \(error.localizedDescription)"
      ]
      if let itemId = taskInfo.metadata?.itemId {
        payload["itemId"] = itemId
      }
      sendEvent("onDownloadError", payload)

      downloadTasks.removeValue(forKey: taskId)
      lastProgressTime.removeValue(forKey: taskId)
      persistTasksLocked()

      processNextInQueueSafelyLocked()
    }
  }

  private func handleErrorLocked(taskId: Int, error: Error) {
    let nsError = error as NSError
    let cancelledByUs = userCancelledTaskIds.remove(taskId) != nil
    let itemId = downloadTasks[taskId]?.metadata?.itemId

    if !cancelledByUs, let info = downloadTasks[taskId], DownloadRetryPolicy.isTransient(nsError) {
      if scheduleRetryLocked(failedTaskId: taskId, info: info, error: nsError) {
        return
      }
      backgroundDownloaderLog.error("Task \(taskId) out of retries; reporting failure")
    }

    // A cancel the system issued carries a reason and, once out of retries, is a real failure the
    // user has to hear about. Only our own cancels (or reasonless ones) end silently.
    let isPlainCancel = nsError.domain == NSURLErrorDomain
      && nsError.code == NSURLErrorCancelled
      && nsError.userInfo[NSURLErrorBackgroundTaskCancelledReasonKey] == nil

    if cancelledByUs || isPlainCancel {
      backgroundDownloaderLog.notice("Task \(taskId) cancelled")
      // JS drives cancellation, so it has usually dismissed the activity already; this covers
      // cancels that originate anywhere else.
      cancelLiveActivity(taskId: taskId)
    } else {
      finishLiveActivity(taskId: taskId, state: .failed)

      var payload: [String: Any] = [
        "taskId": taskId,
        "error": error.localizedDescription
      ]
      if let itemId {
        payload["itemId"] = itemId
      }
      sendEvent("onDownloadError", payload)
    }

    downloadTasks.removeValue(forKey: taskId)
    lastProgressTime.removeValue(forKey: taskId)
    persistTasksLocked()

    // Process next item in queue (whether cancelled or errored)
    processNextInQueueSafelyLocked()
  }

  /// Replaces a failed task with a new attempt that the session starts after the policy's backoff.
  /// Returns false when the budget is spent or no task could be created.
  ///
  /// The backoff rides on `earliestBeginDate` rather than a timer: the session schedules the
  /// attempt itself, so it fires even while the app is suspended, and a background session waits
  /// for connectivity on its own once the attempt is due. The failed task's slot stays occupied
  /// meanwhile, which is what parks the queue instead of failing every item behind it in turn.
  private func scheduleRetryLocked(failedTaskId: Int, info: DownloadTaskInfo, error: NSError) -> Bool {
    let attempt = (info.retryAttempt ?? 0) + 1
    guard DownloadRetryPolicy.shouldRetry(attempt: attempt) else { return false }

    if session == nil {
      initializeSessionLocked()
    }
    guard let session else { return false }

    // Resume data exists when the server supports range requests (direct file downloads); the
    // attempt then continues where the transfer stopped. Transcoded streams have none and restart.
    let resumeData = error.userInfo[NSURLSessionDownloadTaskResumeData] as? Data
    let task: URLSessionDownloadTask
    if let resumeData {
      task = session.downloadTask(withResumeData: resumeData)
    } else if let request = makeRequest(urlString: info.url, headers: info.headers) {
      task = session.downloadTask(with: request)
    } else {
      return false
    }

    let delay = DownloadRetryPolicy.delay(forAttempt: attempt)
    let retryAt = Date().addingTimeInterval(delay)
    task.earliestBeginDate = retryAt

    var retried = info
    retried.retryAttempt = attempt
    downloadTasks.removeValue(forKey: failedTaskId)
    lastProgressTime.removeValue(forKey: failedTaskId)
    downloadTasks[task.taskIdentifier] = retried
    persistTasksLocked()
    task.resume()

    backgroundDownloaderLog.notice(
      "Task \(failedTaskId) failed (\(error.domain, privacy: .public) \(error.code)); attempt \(attempt) as task \(task.taskIdentifier) in \(Int(delay))s, resuming: \(resumeData != nil)"
    )

    // Rebinds the existing activity to the replacement task instead of flashing it as failed.
    startLiveActivity(taskId: task.taskIdentifier, metadata: info.metadata)

    var payload: [String: Any] = [
      "taskId": task.taskIdentifier,
      "previousTaskId": failedTaskId,
      "attempt": attempt,
      "maxAttempts": DownloadRetryPolicy.maxAttempts,
      "retryAt": retryAt.timeIntervalSince1970 * 1000,
      "resumed": resumeData != nil,
      "error": error.localizedDescription
    ]
    if let itemId = info.metadata?.itemId {
      payload["itemId"] = itemId
    }
    sendEvent("onDownloadRetrying", payload)
    return true
  }

  /// Restored tasks the session no longer lists are normally a completion or failure still waiting
  /// to be delivered. One still unresolved after `orphanSweepDelay` died with the previous process
  /// without the system reporting it; it is failed into the retry path instead of lingering as a
  /// download that never moves again.
  private func scheduleOrphanSweepLocked() {
    let restoredIds = Set(downloadTasks.keys)
    guard !restoredIds.isEmpty, let session else { return }

    session.getAllTasks { tasks in
      let liveIds = Set(tasks.map(\.taskIdentifier))
      self.stateQueue.asyncAfter(deadline: .now() + Self.orphanSweepDelay) {
        for taskId in restoredIds.subtracting(liveIds) where self.downloadTasks[taskId] != nil {
          backgroundDownloaderLog.notice("Restored task \(taskId) was never resolved; restarting")
          self.handleErrorLocked(
            taskId: taskId,
            error: NSError(
              domain: NSURLErrorDomain,
              code: NSURLErrorBackgroundSessionWasDisconnected
            )
          )
        }
      }
    }
  }

  /// Nothing in here is actually asynchronous — the previous `async` shape existed only so the
  /// completion handlers could spawn it inside detached `Task`s, which added a fourth unsynchronized
  /// execution context. Now it is a plain function that runs where the state lives.
  private func processNextInQueueLocked() throws -> Int {
    guard !downloadQueue.isEmpty else {
      return -1
    }

    // One download at a time
    guard downloadTasks.isEmpty else {
      return -1
    }

    let next = downloadQueue.removeFirst()
    queueDidChangeLocked()

    guard URL(string: next.url) != nil else {
      backgroundDownloaderLog.error("Invalid URL in queue; skipping to next")
      return try processNextInQueueLocked()
    }

    return try beginDownloadLocked(
      urlString: next.url,
      destinationPath: next.destinationPath,
      metadata: next.metadata,
      headers: next.headers
    )
  }

  private func processNextInQueueSafelyLocked() {
    do {
      _ = try processNextInQueueLocked()
    } catch {
      backgroundDownloaderLog.error(
        "Failed to start next queued download: \(error.localizedDescription, privacy: .public)"
      )
    }
    // Reached after every completion/error/cancel; ends the keeper when the session drained.
    finishContinuedProcessingIfIdleLocked()
  }

  static func setBackgroundCompletionHandler(_ handler: @escaping () -> Void) {
    BackgroundDownloaderModule.backgroundCompletionHandler = handler
  }

  // MARK: - Live Activity

  // Every entry point is wrapped so the rest of the module stays free of availability and platform
  // checks. All of this compiles away on tvOS, where ActivityKit does not exist. The controller
  // confines its own state to its own queue; calls from here never block.

  /// Called after every queue mutation: persists the queue (so it survives process death) and
  /// pushes the count into the Live Activity controller. The controller keeps its own copy of the
  /// count because reading `downloadQueue.count` from the delegate callbacks (as `updateLiveActivity`
  /// used to) was the hottest cross-thread access in the module.
  private func queueDidChangeLocked() {
    taskStore.saveQueue(downloadQueue)
    #if os(iOS)
      guard #available(iOS 16.2, *) else { return }
      DownloadLiveActivityController.shared.setQueuedCount(downloadQueue.count)
    #endif
  }

  /// The module's activity is the primary download UI on every iOS version. On iOS 26+ the
  /// system's continued-processing pill shows alongside it while the keeper runs — Apple mandates
  /// that UI for background execution and it cannot be suppressed — but the card is the element
  /// that survives everything: when the keeper expires (stop tap, stalled progress), the card is
  /// already live and degrades to the timer projection instead of leaving the lock screen empty.
  private func startLiveActivity(taskId: Int, metadata: DownloadActivityMetadata?) {
    #if os(iOS)
      guard #available(iOS 16.2, *), let metadata else { return }
      DownloadLiveActivityController.shared.start(taskId: taskId, metadata: metadata)
    #endif
  }

  private func updateLiveActivity(taskId: Int, bytesWritten: Int64, totalBytes: Int64) {
    #if os(iOS)
      guard #available(iOS 16.2, *) else { return }
      DownloadLiveActivityController.shared.update(
        taskId: taskId,
        bytesWritten: bytesWritten,
        totalBytes: totalBytes
      )
    #endif
  }

  private func finishLiveActivity(taskId: Int, state: DownloadActivityState) {
    #if os(iOS)
      guard #available(iOS 16.2, *) else { return }
      DownloadLiveActivityController.shared.finish(taskId: taskId, state: state)
    #endif
  }

  private func cancelLiveActivity(taskId: Int) {
    #if os(iOS)
      guard #available(iOS 16.2, *) else { return }
      DownloadLiveActivityController.shared.cancel(taskId: taskId)
    #endif
  }

  private func cancelAllLiveActivities() {
    #if os(iOS)
      guard #available(iOS 16.2, *) else { return }
      DownloadLiveActivityController.shared.cancelAll()
    #endif
  }

  // MARK: - Continued processing (iOS 26+)

  // Keeps the process executing while downloads run, so progress keeps reporting after the user
  // backgrounds the app and the Live Activity shows measured percent instead of a projection.
  // Wrapped like the Live Activity helpers; a no-op before iOS 26 or on older build toolchains.

  private func startContinuedProcessingLocked(metadata: DownloadActivityMetadata?) {
    #if os(iOS) && compiler(>=6.2)
      guard #available(iOS 26.0, *), downloadActivityUIEnabled else { return }
      // Titled as a status ("Downloading" / item name) rather than repeating the activity card's
      // title/subtitle — the pill reads as the system's task control, the card as the content,
      // instead of two identical media cards.
      DownloadContinuedProcessingKeeper.shared.ensureRunning(
        title: metadata?.labels["downloading"] ?? "Downloading",
        subtitle: metadata?.title ?? ""
      )
    #endif
  }

  private func updateContinuedProcessingLocked(
    taskId: Int,
    bytesWritten: Int64,
    totalBytes: Int64
  ) {
    #if os(iOS) && compiler(>=6.2)
      guard #available(iOS 26.0, *) else { return }
      let effectiveTotal =
        totalBytes > 0
        ? totalBytes
        : downloadTasks[taskId]?.metadata?.estimatedTotalBytes ?? 0
      DownloadContinuedProcessingKeeper.shared.updateProgress(
        completedBytes: bytesWritten,
        totalBytes: effectiveTotal
      )
    #endif
  }

  private func finishContinuedProcessingIfIdleLocked() {
    #if os(iOS) && compiler(>=6.2)
      guard #available(iOS 26.0, *) else { return }
      guard downloadTasks.isEmpty, downloadQueue.isEmpty else { return }
      DownloadContinuedProcessingKeeper.shared.finish()
    #endif
  }

  /// Reconnects Live Activities left by a previous process to their restored tasks and clears the
  /// rest — otherwise an app killed mid-download leaves one stranded on the Lock Screen. Keyed on
  /// the persisted task store, not `getAllTasks`, so an activity whose transfer finished while the
  /// app was dead survives long enough for the queued completion callback to flip it.
  private func reconcileLiveActivitiesLocked() {
    #if os(iOS)
      guard #available(iOS 16.2, *) else { return }
      DownloadLiveActivityController.shared.reconcile(
        persistedTasks: downloadTasks.compactMapValues(\.metadata)
      )
    #endif
  }
}
