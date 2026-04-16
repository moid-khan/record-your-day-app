import UIKit
import AVFoundation
import React
import MediaPipeTasksVision
import Speech

@objc(HandCameraView)
class HandCameraView: UIView {

  // MARK: - Properties
  private var previewView: UIView!
  private var overlayView: OverlayView!
  private var warningFlashView: UIView!  // Red flash for hand-out-of-frame warning
  private var cameraFeedService: CameraFeedService!
  private var handLandmarkerService: HandLandmarkerService?
  private var beepSoundService: BeepSoundService?
  private var imuSensorService: IMUSensorService?
  private var imuDataPath: String?

  // Recording
  private var movieFileOutput: AVCaptureMovieFileOutput?
  private var isRecording = false
  private var isPaused = false
  private var recordingStartTime: Date?
  private var pausedDuration: TimeInterval = 0
  private var lastPauseTime: Date?
  private var recordingURL: URL?
  private var segmentURLs: [URL] = []
  private enum RecordingStopReason {
    case pause
    case stop
    case none
  }
  private var pendingStopReason: RecordingStopReason = .none
  private var isStoppingSegment: Bool = false
  private var resumeRequestedAfterStop: Bool = false
  private var pendingResumeEvent: Bool = false

  // Hand detection state
  private var handInFrame = false
  // "Fully in frame" (geometry) without requiring perfect landmark validity.
  // Used for clap-start acceptance to avoid being too strict.
  private var handsFullyInFrame = false
  private var recordingElapsedTime: TimeInterval = 0
  private let autoPauseThreshold: TimeInterval = 10.0 // 10 seconds
  private var outOfFrameSince: Date?

  // Beep debouncing - prevent too frequent beeps
  private var lastBeepTime: Date?

  // Callbacks
  @objc var onHandStatusChange: RCTDirectEventBlock?
  @objc var onReady: RCTDirectEventBlock?
  @objc var onError: RCTDirectEventBlock?
  @objc var onRecordingStarted: RCTDirectEventBlock?
  @objc var onRecordingPaused: RCTDirectEventBlock?
  @objc var onRecordingResumed: RCTDirectEventBlock?
  @objc var onRecordingCompleted: RCTDirectEventBlock?

  // State
  private var isActive = false
  private var isShuttingDown = false
  private var isStartingRecording = false
  private let backgroundQueue = DispatchQueue(label: "com.recordyourday.handcamera.background")
  // Serial queue for processing hand results to prevent race conditions with shutdown
  private let handProcessingQueue = DispatchQueue(label: "com.recordyourday.handcamera.handprocessing", qos: .userInitiated)
  private func canEmitEvents() -> Bool {
    return !isShuttingDown && isActive
  }

  // Clap detection - replaces voice start
  @objc var enableClapStart: Bool = false {
    didSet {
      // CRITICAL: Check isShuttingDown SYNCHRONOUSLY before queuing async work
      // This prevents clap detector from restarting during cleanup
      guard !isShuttingDown else {
        // If shutting down, stop the detector immediately without async
        stopClapDetector()
        return
      }
      DispatchQueue.main.async { [weak self] in
        guard let self = self, !self.isShuttingDown else { return }
        self.updateClapDetector()
      }
    }
  }
  @objc var onClapDetected: RCTDirectEventBlock?

  // Clap detection state
  private var audioRecorder: AVAudioRecorder?
  private var clapDetectionTimer: Timer?
  private var lastClapTime: Date?
  // Clap threshold in dB: Higher (less negative) = louder sound required
  // AVAudioRecorder peakPower ranges from -160 dB (silence) to 0 dB (maximum input level)
  // Testing showed:
  // - Pinch/finger snap: around -1 to -3 dB
  // - Talking: around -10 to -20 dB
  // - Real clap: should be louder than finger sounds
  // Using -5.0 dB - filters out most finger sounds but catches real claps
  // Also adding duration check: real claps are impulsive (short spike)
  private let clapThreshold: Float = -5.0 // dB threshold - loud sounds only
  private let clapCooldown: TimeInterval = 2.0 // Cooldown to prevent double triggers
  private var consecutiveLoudSamples: Int = 0 // Track consecutive loud samples to filter sustained sounds
  private let clapAudioSession = AVAudioSession.sharedInstance()

  // Voice start - kept for backward compatibility but disabled by default
  @objc var enableVoiceStart: Bool = false {
    didSet { DispatchQueue.main.async { [weak self] in self?.updateVoiceListener() } }
  }
  @objc var requireHandsForVoiceStart: Bool = true
  @objc var onVoiceCommand: RCTDirectEventBlock?

  private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
  private let audioEngine = AVAudioEngine()
  private var speechRequest: SFSpeechAudioBufferRecognitionRequest?
  private var speechTask: SFSpeechRecognitionTask?
  private var lastVoiceStartAt: Date?
  private let voiceAudioSession = AVAudioSession.sharedInstance()
  private let cueSynthesizer = AVSpeechSynthesizer()
  
  // MARK: - Initialization
  override init(frame: CGRect) {
    super.init(frame: frame)
    setupViews()
    setupServices()
    setupAppLifecycleObservers()
  }
  
  required init?(coder: NSCoder) {
    super.init(coder: coder)
    setupViews()
    setupServices()
    setupAppLifecycleObservers()
  }
  
  // Track if we need to restart camera when app becomes active
  private var shouldRestartOnBecomeActive = false
  private var wasRecordingBeforeInterrupt = false

  private func setupAppLifecycleObservers() {
    // Listen for app lifecycle events to stop operations immediately
    // This prevents crashes when app is killed or goes to background
    // Use custom notifications from AppDelegate to ensure cleanup happens BEFORE React Native suspension
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(applicationWillResignActive),
      name: NSNotification.Name("AppWillResignActive"),
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(applicationDidEnterBackground),
      name: NSNotification.Name("AppDidEnterBackground"),
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(applicationWillTerminate),
      name: NSNotification.Name("AppWillTerminate"),
      object: nil
    )

    // Listen for app becoming active again to restart camera
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(applicationDidBecomeActive),
      name: UIApplication.didBecomeActiveNotification,
      object: nil
    )

    // Also listen to system notifications as backup
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(applicationWillResignActive),
      name: UIApplication.willResignActiveNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(applicationDidEnterBackground),
      name: UIApplication.didEnterBackgroundNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(applicationWillTerminate),
      name: UIApplication.willTerminateNotification,
      object: nil
    )

    // Listen for audio session interruptions (phone calls, Siri, etc.)
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleAudioSessionInterruption),
      name: AVAudioSession.interruptionNotification,
      object: nil
    )
  }

  @objc private func applicationWillResignActive() {
    // App is about to become inactive (e.g., phone call, notification, system dialog)
    // DON'T stop camera for brief interruptions - only pause recording if active
    // This prevents camera from getting stuck when low battery popup appears

    // Only fully stop if we're recording (to prevent data loss)
    if isRecording && !isShuttingDown {
      print("📱 App will resign active while recording, pausing...")
      wasRecordingBeforeInterrupt = true
      shouldRestartOnBecomeActive = true
      // Pause recording but keep camera session alive
      if !isPaused {
        pauseRecording()
      }
    } else if isActive && !isShuttingDown {
      // Not recording, just mark for restart
      print("📱 App will resign active (not recording), marking for restart")
      shouldRestartOnBecomeActive = true
    }
  }

  @objc private func applicationDidBecomeActive() {
    // App became active again - restart camera if needed
    guard shouldRestartOnBecomeActive, window != nil else { return }

    print("📱 App became active, restarting camera...")
    shouldRestartOnBecomeActive = false

    // Reset shutdown flags
    isShuttingDown = false

    // Restart camera session
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
      guard let self = self, self.window != nil else { return }

      // Reinitialize hand landmarker if needed
      if self.handLandmarkerService == nil {
        self.backgroundQueue.async { [weak self] in
          self?.initializeHandLandmarker()
        }
      }

      // Restart camera
      self.cameraFeedService.delegate = self
      self.cameraFeedService.startLiveCameraSession { [weak self] status in
        DispatchQueue.main.async {
          guard let self = self, self.window != nil else { return }

          switch status {
          case .success:
            print("✅ Camera restarted successfully after becoming active")
            self.isActive = true

            // Resume recording if we were recording before
            if self.wasRecordingBeforeInterrupt && self.isPaused {
              print("▶️ Resuming recording after app became active")
              self.wasRecordingBeforeInterrupt = false
              // Give camera a moment to stabilize before resuming
              DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
                self?.resumeRecording()
              }
            }

            // Update clap detector if needed
            self.updateClapDetector()

          case .failed:
            print("❌ Camera restart failed after becoming active")
            self.onError?(["message": "Camera restart failed"])

          case .permissionDenied:
            print("❌ Camera permission denied on restart")
            self.onError?(["message": "Camera permission denied"])
          }
        }
      }
    }
  }

  @objc private func handleAudioSessionInterruption(notification: Notification) {
    guard let userInfo = notification.userInfo,
          let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }

    switch type {
    case .began:
      print("🔇 Audio session interruption began (phone call, Siri, etc.)")
      // Pause recording if active
      if isRecording && !isPaused {
        wasRecordingBeforeInterrupt = true
        pauseRecording()
      }

    case .ended:
      print("🔊 Audio session interruption ended")
      // Check if we should resume
      if let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt {
        let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
        if options.contains(.shouldResume) {
          print("🔊 Audio session says we should resume")
          // Reconfigure audio session
          do {
            try AVAudioSession.sharedInstance().setActive(true)
            // Resume recording if we were recording
            if wasRecordingBeforeInterrupt && isPaused {
              wasRecordingBeforeInterrupt = false
              DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
                self?.resumeRecording()
              }
            }
          } catch {
            print("⚠️ Failed to reactivate audio session: \(error)")
          }
        }
      }

    @unknown default:
      break
    }
  }
  
  @objc private func applicationDidEnterBackground() {
    // App entered background - stop all operations immediately
    // CRITICAL: This must happen synchronously on main thread BEFORE React Native is suspended
    // Order of operations:
    // 1. Stop recording synchronously
    // 2. Stop camera session synchronously
    // 3. Clear all React Native callbacks
    print("📱 App entered background, stopping camera and clearing React Native callbacks immediately")
    
    // Ensure we're on main thread for synchronous operations
    if Thread.isMainThread {
      stopCameraAndClearCallbacks()
    } else {
      DispatchQueue.main.sync {
        stopCameraAndClearCallbacks()
      }
    }
  }
  
  /// Stops camera operations and clears React Native callbacks synchronously
  /// This must be called on the main thread
  /// This method is idempotent - safe to call multiple times
  private func stopCameraAndClearCallbacks() {
    // Guard against multiple calls - if already shutting down, just clear callbacks
    let wasAlreadyShuttingDown = isShuttingDown
    
    // CRITICAL: Set shutdown flag FIRST and immediately
    // This prevents any new hand detections from being queued
    isShuttingDown = true
    isActive = false
    
    // If we were already shutting down, just ensure callbacks are cleared and return
    if wasAlreadyShuttingDown {
      clearReactNativeCallbacks()
      return
    }
    
    // Guard against accessing cameraFeedService if it's nil (shouldn't happen, but be safe)
    guard let cameraService = cameraFeedService else {
      // Camera service is nil, just clear callbacks
      clearReactNativeCallbacks()
      return
    }
    
    // CRITICAL: Clear React Native callbacks FIRST to prevent any events from being emitted
    // This must happen before we stop anything, so that any pending detections won't try to emit
    clearReactNativeCallbacks()
    
    // 1. Clear hand landmarker service IMMEDIATELY to prevent new detections
    // This must happen before we wait for pending work, so no new detections start
    handLandmarkerService = nil
    
    // 2. Clear delegate to stop receiving camera callbacks
    cameraService.delegate = nil
    
    // 3. Wait for any pending hand processing to complete
    // Use barrier to ensure all pending work completes, but since callbacks are already nil,
    // any work that completes won't try to emit events
    handProcessingQueue.sync(flags: .barrier) {
      // All pending work will complete here
      // But callbacks are already nil, so no events will be emitted
    }
    
    // 4. Stop recording if active (synchronously)
    if isRecording {
      pendingStopReason = .stop
      if let movieFileOutput = movieFileOutput {
        // Stop recording synchronously on session queue
        // This must complete before we stop the camera session
        sessionQueue.sync { [weak self] in
          guard let self = self, let cameraService = self.cameraFeedService else { return }
          if movieFileOutput.isRecording {
            movieFileOutput.stopRecording()
          }
          // Remove movie file output from session to prevent further operations
          if cameraService.captureSession.outputs.contains(movieFileOutput) {
            cameraService.captureSession.removeOutput(movieFileOutput)
          }
        }
      }
      // Mark recording as stopped immediately (don't wait for delegate callback)
      isRecording = false
      isPaused = false
      movieFileOutput = nil
    }
    
    // 5. Stop clap detector and voice listener (synchronous)
    stopClapDetector()
    stopVoiceListener()

    // 6. Stop camera session SYNCHRONOUSLY - this is critical
    // The session must be fully stopped before we finish
    cameraService.stopSessionSynchronously()
  }
  
  @objc private func applicationWillTerminate() {
    // App is about to terminate - emergency cleanup
    // CRITICAL: Stop camera and clear callbacks synchronously on main thread immediately
    print("📱 App will terminate, emergency cleanup")

    // Set shutdown flags IMMEDIATELY before any async work
    isShuttingDown = true
    isActive = false

    // Clear callbacks IMMEDIATELY - don't wait for queue operations
    clearReactNativeCallbacks()

    // Ensure we're on main thread for synchronous operations
    if Thread.isMainThread {
      stopCameraAndClearCallbacks()
      emergencyCleanup()
    } else {
      // During termination, sync dispatch might deadlock - use async with very short timeout
      let group = DispatchGroup()
      group.enter()
      DispatchQueue.main.async {
        self.stopCameraAndClearCallbacks()
        self.emergencyCleanup()
        group.leave()
      }
      // Wait max 100ms then proceed anyway
      _ = group.wait(timeout: .now() + 0.1)
    }
  }
  
  /// Clears all React Native callbacks immediately and synchronously
  /// This must be called on the main thread BEFORE React Native bridge is suspended
  private func clearReactNativeCallbacks() {
    // CRITICAL: Clear all callbacks immediately to prevent accessing deallocated React Native bridge
    // This prevents the Scheduler crash by ensuring no callbacks try to access the bridge after suspension
    onHandStatusChange = nil
    onReady = nil
    onError = nil
    onRecordingStarted = nil
    onRecordingPaused = nil
    onRecordingResumed = nil
    onRecordingCompleted = nil
    onVoiceCommand = nil
    onClapDetected = nil
  }
  
  private func emergencyCleanup() {
    // Emergency cleanup when app is terminating
    // This must be synchronous and complete quickly
    // Note: stopCameraAndClearCallbacks() already handles most cleanup,
    // this is for any additional cleanup needed
    
    // Ensure shutdown flags are set
    isShuttingDown = true
    isActive = false
    
    // Clear any remaining references
    // (Most cleanup is already done in stopCameraAndClearCallbacks)
  }

  // MARK: - Role-Play Audio Cues (TTS)
  @objc
  func speakCue(text: String) {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }

    DispatchQueue.main.async {
      print("🗣️ RolePlay cue: \(trimmed)")
      // IMPORTANT:
      // Do NOT reconfigure AVAudioSession here while AVCaptureMovieFileOutput is recording.
      // Flipping categories/modes during recording can cause TTS to fail with:
      // - TTSAQ: Failed to enqueue buffer (-66632)
      // - AVAudioBuffer mDataByteSize (0) should be non-zero
      // We rely on the already-active recording/speech session configuration.

      let utterance = AVSpeechUtterance(string: trimmed)
      utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
      // Slower coaching-style delivery.
      utterance.rate = 0.42
      utterance.volume = 1.0
      // Add a short pause after each cue so the user can act.
      utterance.postUtteranceDelay = 0.9
      self.cueSynthesizer.speak(utterance)
    }
  }
  
  private func setupViews() {
    // Preview view
    previewView = UIView()
    previewView.backgroundColor = .black
    previewView.translatesAutoresizingMaskIntoConstraints = false
    addSubview(previewView)
    
    NSLayoutConstraint.activate([
      previewView.topAnchor.constraint(equalTo: topAnchor),
      previewView.leadingAnchor.constraint(equalTo: leadingAnchor),
      previewView.trailingAnchor.constraint(equalTo: trailingAnchor),
      previewView.bottomAnchor.constraint(equalTo: bottomAnchor)
    ])
    
    // Overlay view for hand landmarks
    overlayView = OverlayView()
    overlayView.translatesAutoresizingMaskIntoConstraints = false
    overlayView.backgroundColor = .clear
    addSubview(overlayView)

    NSLayoutConstraint.activate([
      overlayView.topAnchor.constraint(equalTo: topAnchor),
      overlayView.leadingAnchor.constraint(equalTo: leadingAnchor),
      overlayView.trailingAnchor.constraint(equalTo: trailingAnchor),
      overlayView.bottomAnchor.constraint(equalTo: bottomAnchor)
    ])

    // Warning flash overlay - thick red border for hand-out-of-frame warning
    warningFlashView = UIView()
    warningFlashView.translatesAutoresizingMaskIntoConstraints = false
    warningFlashView.backgroundColor = .clear
    warningFlashView.layer.borderColor = UIColor.red.cgColor
    warningFlashView.layer.borderWidth = 0
    warningFlashView.isUserInteractionEnabled = false
    addSubview(warningFlashView)

    NSLayoutConstraint.activate([
      warningFlashView.topAnchor.constraint(equalTo: topAnchor),
      warningFlashView.leadingAnchor.constraint(equalTo: leadingAnchor),
      warningFlashView.trailingAnchor.constraint(equalTo: trailingAnchor),
      warningFlashView.bottomAnchor.constraint(equalTo: bottomAnchor)
    ])
  }

  /// Flash the warning border - very visible thick red border pulse
  private func flashWarning() {
    guard Thread.isMainThread else {
      DispatchQueue.main.async { [weak self] in
        self?.flashWarning()
      }
      return
    }

    // Show thick red border immediately
    warningFlashView.layer.borderWidth = 20
    print("🔴 Warning flash - red border shown")

    // Hide the border after a short delay
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
      self?.warningFlashView.layer.borderWidth = 0
    }
  }
  
  private func setupServices() {
    cameraFeedService = CameraFeedService(previewView: previewView)
    cameraFeedService.delegate = self
    beepSoundService = BeepSoundService.shared
    // Set up visual warning flash callback
    beepSoundService?.onWarningFlash = { [weak self] in
      self?.flashWarning()
    }
    imuSensorService = IMUSensorService()

    // Pre-initialize hand landmarker in background to reduce delay when camera starts
    // This way it's ready as soon as the camera starts
    backgroundQueue.async { [weak self] in
      self?.initializeHandLandmarker()
    }
  }
  
  // MARK: - Public Methods
  @objc func start() {
    guard !isActive else { return }
    
    print("🎬 HandCameraView.start() called")
    isShuttingDown = false
    isActive = true
    
    // Hand landmarker should already be initialized in setupServices()
    // If not, initialize it now (fallback)
    if handLandmarkerService == nil {
      backgroundQueue.async { [weak self] in
        self?.initializeHandLandmarker()
      }
    }
    
    // Start camera session
    cameraFeedService.startLiveCameraSession { [weak self] status in
      DispatchQueue.main.async {
        guard let self = self, !self.isShuttingDown, self.window != nil else { return }
        switch status {
        case .success:
          print("✅ Camera started successfully")
          guard self.onReady != nil else { return }
          self.onReady?([:])
          self.updateClapDetector()
          self.updateVoiceListener()
        case .failed:
          print("❌ Camera configuration failed")
          guard self.onError != nil else { return }
          self.onError?(["message": "Camera configuration failed"])
        case .permissionDenied:
          print("❌ Camera permission denied")
          guard self.onError != nil else { return }
          self.onError?(["message": "Camera permission denied"])
        }
      }
    }
  }
  
  @objc func stop() {
    // CRITICAL: Set isShuttingDown FIRST, even before the guard
    // This prevents any prop changes (like enableClapStart) from restarting listeners
    isShuttingDown = true

    guard isActive else { return }

    print("🛑 HandCameraView.stop() called")
    isActive = false
    
    // CRITICAL: Clear all React Native callbacks FIRST and synchronously
    // This must happen on main thread to prevent race conditions
    // If we're not on main thread, dispatch synchronously to main thread
    if Thread.isMainThread {
      clearReactNativeCallbacks()
    } else {
      DispatchQueue.main.sync {
        clearReactNativeCallbacks()
      }
    }
    
    // Clear delegate immediately to stop receiving camera callbacks
    // This must happen BEFORE stopping the session to prevent race conditions
    cameraFeedService.delegate = nil
    
    // Stop recording if active (this may queue async work, but callbacks are already nil)
    if isRecording {
      stopRecording()
    }
    
    // Stop camera session (async, but delegate is already nil so no more callbacks)
    cameraFeedService.stopSession()

    // Stop clap detector and voice listener
    stopClapDetector()
    stopVoiceListener()
    
    // CRITICAL: Clear hand landmarker service FIRST to prevent new detections
    // This must happen before the barrier to ensure no new detections start
    handLandmarkerService = nil
    
    // Use a barrier to ensure any pending hand processing completes before we finish
    // This prevents race conditions where a detection completes after we set isShuttingDown
    // The barrier waits for any work already queued on handProcessingQueue to complete
    handProcessingQueue.sync(flags: .barrier) {
      // This ensures any pending work on handProcessingQueue completes
      // before we finish the stop() method
      // At this point, handLandmarkerService is already nil, so no new work will start
      // Any work that was already queued will check isShuttingDown and return early
    }
    
    // Note: We don't wait for main queue dispatches here because:
    // 1. DispatchQueue.main.sync from a background thread can cause deadlocks
    // 2. Any main queue work that was queued will check isShuttingDown and return early
    // 3. The callbacks are already nil, so even if work executes, it won't call callbacks
  }
  
  // MARK: - Recording Methods
  @objc func startRecording() {
    startRecordingInternal(flagAlreadySet: false)
  }

  /// Internal method that allows bypassing the isStartingRecording check
  /// when called from clap/voice detection (which sets the flag first for race protection)
  private func startRecordingInternal(flagAlreadySet: Bool) {
    guard isActive, !isRecording else {
      print("⚠️ Cannot start recording: isActive=\(isActive), isRecording=\(isRecording)")
      return
    }

    // If flag wasn't already set by caller, check and set it
    if !flagAlreadySet {
      guard !isStartingRecording else {
        print("📹 Recording start already in progress")
        return
      }
      isStartingRecording = true
    }

    // IMPORTANT: Don't require hands to be in frame to START recording
    // The user can click the button or say "start" - we should start regardless of hand state
    // Hand detection will auto-pause if hands leave frame for 10s after recording starts

    print("📹 Starting recording...")

    // Add timeout to prevent getting stuck if recording doesn't start
    DispatchQueue.main.asyncAfter(deadline: .now() + 5.0) { [weak self] in
      guard let self = self, self.isStartingRecording, !self.isRecording else { return }
      print("⚠️ Recording start timeout - resetting state")
      self.isStartingRecording = false
      // Always emit error even during shutdown - this is a user-facing error
      if let errorCallback = self.onError {
        errorCallback(["message": "Recording failed to start. Please try again."])
      }
    }

    // If the voice listener is running, stop it BEFORE touching the shared audio session.
    // This prevents rare CoreAudio crashes like:
    // AVAudioBuffer.mm:281 mBuffers[0].mDataByteSize (0) should be non-zero
    stopVoiceListener()

    // IMPORTANT: Configure audio session for video recording with TTS support
    // This configuration allows:
    // - Video recording with audio
    // - TTS cues during recording
    // - System sounds (beeps) to play alongside recording
    // Note: BeepSoundService uses SystemSoundID which bypasses AVAudioSession entirely
    do {
      try voiceAudioSession.setCategory(
        .playAndRecord,
        mode: .videoRecording,
        options: [
          .defaultToSpeaker,
          .mixWithOthers,
          .allowBluetooth,
          .allowBluetoothA2DP
        ]
      )
      try voiceAudioSession.setActive(true, options: .notifyOthersOnDeactivation)
      print("✅ Audio session configured for recording")
    } catch {
      print("⚠️ Failed to configure audio session: \(error.localizedDescription)")
    }
    
    // Setup movie file output
    setupMovieFileOutput()
    
    guard let movieFileOutput = movieFileOutput else {
      print("❌ Cannot setup recording: movieFileOutput is nil")
      onError?(["message": "Failed to setup recording"])
      isStartingRecording = false
      return
    }
    
    // Get session from cameraFeedService
    let session = cameraFeedService.captureSession
    
    // Add output to session if not already added
    if !session.outputs.contains(movieFileOutput) {
      if session.canAddOutput(movieFileOutput) {
        session.addOutput(movieFileOutput)
        print("✅ Movie file output added to session")
      } else {
        print("❌ Cannot add movie file output to session")
        onError?(["message": "Cannot add recording output"])
        isStartingRecording = false
        return
      }
    }
    cameraFeedService.applyPreferredZoomFactor()
    
    // Reset segments
    segmentURLs = []

    // Create recording URL (segment 1)
    let tempDir = FileManager.default.temporaryDirectory
    let fileName = "recording_\(Date().timeIntervalSince1970)_seg1.mp4"
    recordingURL = tempDir.appendingPathComponent(fileName)
    
    guard let recordingURL = recordingURL else {
      print("❌ Cannot create recording URL")
      onError?(["message": "Cannot create recording file"])
      isStartingRecording = false
      return
    }
    
    // Start recording segment
    sessionQueue.async { [weak self] in
      guard let self = self else { return }
      
      // Configure connection
      if let connection = movieFileOutput.connection(with: .video) {
        if connection.isVideoStabilizationSupported {
          connection.preferredVideoStabilizationMode = .auto
        }
        if connection.isVideoOrientationSupported {
          connection.videoOrientation = .portrait
        }
      }
      
      // Start recording
      self.pendingStopReason = .none
      movieFileOutput.startRecording(to: recordingURL, recordingDelegate: self)
      
      DispatchQueue.main.async {
        self.isRecording = true
        self.isPaused = false
        self.isStartingRecording = false
        self.isStoppingRecording = false // Reset stop flag when starting new recording
        self.recordingStartTime = Date()
        self.pausedDuration = 0
        self.recordingElapsedTime = 0
        self.lastPauseTime = nil
        self.outOfFrameSince = nil
        self.lastVoiceStartAt = Date()

        // Start IMU sensor collection synchronized with recording
        self.imuDataPath = nil
        if let imuService = self.imuSensorService {
          let referenceTime = CACurrentMediaTime()
          if imuService.startCollection(referenceTime: referenceTime) {
            print("📊 IMU collection started at reference time: \(referenceTime)")
          } else {
            print("⚠️ Failed to start IMU collection")
          }
        }

        print("✅ Recording started: \(recordingURL.path)")
        // Confirmation sound
        self.beepSoundService?.playDing()
        // Check conditions before emitting event
        guard !self.isShuttingDown, self.window != nil, self.onRecordingStarted != nil else { return }
        self.onRecordingStarted?([:])
      }
    }
  }
  
  @objc func pauseRecording() {
    guard isRecording, !isPaused else { return }
    
    print("⏸️ Pausing recording...")
    
    lastPauseTime = Date()
    isPaused = true

    // Implement pause by stopping current segment
    pendingStopReason = .pause
    isStoppingSegment = true
    resumeRequestedAfterStop = false
    sessionQueue.async { [weak self] in
      guard let self = self, let movieFileOutput = self.movieFileOutput else { return }
      if movieFileOutput.isRecording {
        movieFileOutput.stopRecording()
      } else {
        self.isStoppingSegment = false
        DispatchQueue.main.async { [weak self] in
          guard let self = self, !self.isShuttingDown, self.window != nil, self.onRecordingPaused != nil else { return }
          self.onRecordingPaused?([:])
        }
      }
    }
  }
  
  @objc func resumeRecording() {
    guard isRecording, isPaused else { return }
    
    print("▶️ Resuming recording...")

    // If the previous segment is still stopping/finishing, defer resume until we get didFinishRecordingTo
    if isStoppingSegment || (movieFileOutput?.isRecording ?? false) {
      print("⏳ Resume requested while stopping segment; will resume after stop completes")
      resumeRequestedAfterStop = true
      return
    }
    
    if let lastPauseTime = lastPauseTime {
      pausedDuration += Date().timeIntervalSince(lastPauseTime)
      self.lastPauseTime = nil
    }
    
    // We'll mark paused=false after didStartRecordingTo for the new segment (more reliable)
    pendingResumeEvent = true

    // Start a new segment
    setupMovieFileOutput()
    guard let movieFileOutput = movieFileOutput else {
      onError?(["message": "Failed to setup recording"])
      return
    }
    let session = cameraFeedService.captureSession
    if !session.outputs.contains(movieFileOutput) {
      if session.canAddOutput(movieFileOutput) {
        session.addOutput(movieFileOutput)
      } else {
        onError?(["message": "Cannot add recording output"])
        return
      }
    }
    cameraFeedService.applyPreferredZoomFactor()

    let tempDir = FileManager.default.temporaryDirectory
    let fileName = "recording_\(Date().timeIntervalSince1970)_seg\(segmentURLs.count + 1).mp4"
    let segmentURL = tempDir.appendingPathComponent(fileName)
    recordingURL = segmentURL

    sessionQueue.async { [weak self] in
      guard let self = self else { return }
      self.pendingStopReason = .none
      movieFileOutput.startRecording(to: segmentURL, recordingDelegate: self)
    }
  }
  
  private var isStoppingRecording = false

  @objc func stopRecording() {
    // Prevent double-stopping which causes "No recording segments found" error
    guard isRecording, !isStoppingRecording else {
      print("⚠️ stopRecording ignored: isRecording=\(isRecording), isStoppingRecording=\(isStoppingRecording)")
      return
    }

    print("⏹️ Stopping recording...")
    isStoppingRecording = true

    pendingStopReason = .stop
    sessionQueue.async { [weak self] in
      guard let self = self, let movieFileOutput = self.movieFileOutput else {
        DispatchQueue.main.async {
          self?.isStoppingRecording = false
        }
        return
      }
      if movieFileOutput.isRecording {
        movieFileOutput.stopRecording()
      } else {
        DispatchQueue.main.async {
          self.finishRecordingAndEmit()
        }
      }
    }
  }

  private func finishRecordingAndEmit() {
    // Merge segments (if any) into a single MP4 and send to RN
    isRecording = false
    isPaused = false
    isStoppingRecording = false

    let segments = segmentURLs
    segmentURLs = []
    recordingStartTime = nil
    lastPauseTime = nil
    outOfFrameSince = nil

    // CRITICAL: Stop clap detector and voice listener BEFORE emitting completion
    // This prevents any listeners from restarting during the callback
    stopClapDetector()
    stopVoiceListener()

    // Stop IMU collection and save data
    // We save it early so the path is available for all completion callbacks
    imuDataPath = nil
    if let imuService = imuSensorService {
      // Determine the video path to use for IMU file naming
      // Use the first segment path as a base for the IMU filename
      if let firstSegment = segments.first {
        let imuPath = imuService.stopAndSave(videoPath: firstSegment.path)
        imuDataPath = imuPath
        print("📊 IMU data saved to: \(imuPath ?? "nil")")
      } else {
        _ = imuService.stopCollection() // Just stop without saving if no segments
        print("⚠️ No video segments - IMU data discarded")
      }
    }

    guard !segments.isEmpty else {
      // Nothing recorded
      guard !isShuttingDown, window != nil, onError != nil else { return }
      onError?(["message": "No recording segments found"])
      return
    }

    // If there is only one segment, return it
    // Check that we're not shutting down and callback is still valid
    if segments.count == 1 {
      guard !isShuttingDown, window != nil, onRecordingCompleted != nil else { return }
      onRecordingCompleted?([
        "filePath": segments[0].path,
        "duration": recordingElapsedTime,
        "imuDataPath": imuDataPath ?? ""
      ])
      return
    }

    // Merge multiple segments
    let mixComposition = AVMutableComposition()
    guard
      let videoTrack = mixComposition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
      let audioTrack = mixComposition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
    else {
      guard !isShuttingDown, window != nil, onError != nil else { return }
      onError?(["message": "Failed to create composition tracks"])
      return
    }

    var currentTime = CMTime.zero
    for url in segments {
      let asset = AVAsset(url: url)
      if let assetVideoTrack = asset.tracks(withMediaType: .video).first {
        try? videoTrack.insertTimeRange(CMTimeRange(start: .zero, duration: asset.duration), of: assetVideoTrack, at: currentTime)
      }
      if let assetAudioTrack = asset.tracks(withMediaType: .audio).first {
        try? audioTrack.insertTimeRange(CMTimeRange(start: .zero, duration: asset.duration), of: assetAudioTrack, at: currentTime)
      }
      currentTime = CMTimeAdd(currentTime, asset.duration)
    }

    let outputURL = FileManager.default.temporaryDirectory.appendingPathComponent("recording_\(Date().timeIntervalSince1970)_merged.mp4")
    if FileManager.default.fileExists(atPath: outputURL.path) {
      try? FileManager.default.removeItem(at: outputURL)
    }

    guard let exportSession = AVAssetExportSession(asset: mixComposition, presetName: AVAssetExportPresetHighestQuality) else {
      guard !isShuttingDown, window != nil, onError != nil else { return }
      onError?(["message": "Failed to create export session"])
      return
    }
    exportSession.outputURL = outputURL
    exportSession.outputFileType = .mp4
    exportSession.shouldOptimizeForNetworkUse = true

    exportSession.exportAsynchronously { [weak self] in
      DispatchQueue.main.async {
        guard let self = self else { return }
        // If view is being torn down or already detached, don't emit events.
        // Also check that callbacks are still valid
        guard !self.isShuttingDown, self.window != nil, 
              self.onRecordingCompleted != nil, self.onError != nil else { return }
        if exportSession.status == .completed {
          self.onRecordingCompleted?([
            "filePath": outputURL.path,
            "duration": self.recordingElapsedTime,
            "imuDataPath": self.imuDataPath ?? ""
          ])
        } else {
          let exportMessage = "Failed to export merged video: \(exportSession.error?.localizedDescription ?? "unknown")"
          // Fallback: return the first recorded segment so the user still gets a file.
          if let fallback = segments.first {
            self.onRecordingCompleted?([
              "filePath": fallback.path,
              "duration": self.recordingElapsedTime,
              "imuDataPath": self.imuDataPath ?? ""
            ])
          } else {
            self.onError?(["message": exportMessage])
          }
        }
      }
    }
  }
  
  private func setupMovieFileOutput() {
    if movieFileOutput == nil {
      movieFileOutput = AVCaptureMovieFileOutput()
      
      // Configure for high quality
      if let connection = movieFileOutput?.connection(with: .video) {
        if connection.isVideoStabilizationSupported {
          connection.preferredVideoStabilizationMode = .off // avoid FOV crop at 0.5x
        }
      }
    }
  }
  
  private var sessionQueue: DispatchQueue {
    return cameraFeedService.sessionQueue
  }
  
  // MARK: - Hand Landmarker
  private func initializeHandLandmarker() {
    let modelPath = Bundle.main.path(forResource: "hand_landmarker", ofType: "task") ?? ""
    
    handLandmarkerService = HandLandmarkerService.liveStreamHandLandmarkerService(
      modelPath: modelPath,
      numHands: 2,
      minHandDetectionConfidence: 0.7,  // Increased from 0.5 to reduce false positives
      minHandPresenceConfidence: 0.7,   // Increased from 0.5 to reduce false positives
      minTrackingConfidence: 0.6,       // Increased from 0.5 for more stable tracking
      liveStreamDelegate: self,
      delegate: .CPU // Use CPU delegate
    )
    
    print("✅ HandLandmarkerService initialized")
    if let cameraInfo = cameraFeedService?.cameraDevice {
      print("📷 Using camera: \(cameraInfo.deviceType.rawValue) | fov=\(cameraInfo.activeFormat.videoFieldOfView) | zoom=\(cameraInfo.videoZoomFactor)")
    }
    
    // Notify on main thread that hand landmarker is ready
    DispatchQueue.main.async { [weak self] in
      // Hand landmarker is now ready for processing
      // This helps reduce initial lag by ensuring it's initialized before camera starts
    }
  }
  
  // MARK: - Hand Detection Logic

  /// Validates that a set of landmarks represents a real hand based on geometric constraints
  /// This helps filter out obvious false positives while being lenient enough to accept
  /// hands in various orientations (palm up, palm down, fingers spread, fingers closed)
  private func isValidHandLandmarks(_ landmarks: [NormalizedLandmark]) -> Bool {
    // Must have exactly 21 landmarks for a valid hand
    guard landmarks.count == 21 else { return false }

    // Hand landmark indices:
    // 0: wrist
    // 5: index MCP, 9: middle MCP, 13: ring MCP, 17: pinky MCP
    // 4: thumb tip, 8: index tip, 12: middle tip, 16: ring tip, 20: pinky tip

    let wrist = landmarks[0]
    let thumbTip = landmarks[4]
    let indexTip = landmarks[8]
    let middleTip = landmarks[12]
    let pinkyTip = landmarks[20]
    let indexMCP = landmarks[5]
    let pinkyMCP = landmarks[17]

    // Calculate the bounding box of all landmarks
    var minX: Float = 1.0, maxX: Float = 0.0
    var minY: Float = 1.0, maxY: Float = 0.0
    for lm in landmarks {
      minX = min(minX, lm.x)
      maxX = max(maxX, lm.x)
      minY = min(minY, lm.y)
      maxY = max(maxY, lm.y)
    }
    let boundingWidth = maxX - minX
    let boundingHeight = maxY - minY

    // Check 1: The landmarks should span a reasonable area
    // A face detection would have landmarks clustered very tightly
    // A real hand should span at least 3% of frame in each dimension
    if boundingWidth < 0.03 || boundingHeight < 0.03 {
      return false
    }

    // Check 2: The bounding box shouldn't be excessively large (> 80% of frame)
    // This filters out full-body detections
    if boundingWidth > 0.8 && boundingHeight > 0.8 {
      return false
    }

    // Check 3: Aspect ratio sanity check
    // Hands typically have aspect ratio between 0.3 and 3.0 (can be tall or wide depending on orientation)
    let aspectRatio = boundingWidth / max(boundingHeight, 0.001)
    if aspectRatio < 0.2 || aspectRatio > 5.0 {
      return false
    }

    // Check 4: The fingertips should not all be at the exact same position as wrist
    // (which would indicate a degenerate detection)
    let avgTipX = (thumbTip.x + indexTip.x + middleTip.x + pinkyTip.x) / 4.0
    let avgTipY = (thumbTip.y + indexTip.y + middleTip.y + pinkyTip.y) / 4.0
    let tipToWristDist = sqrt(pow(avgTipX - wrist.x, 2) + pow(avgTipY - wrist.y, 2))
    if tipToWristDist < 0.02 {
      return false  // All fingertips clustered at wrist = invalid
    }

    // Check 5: Palm width should be reasonable (index MCP to pinky MCP)
    let palmWidth = sqrt(pow(indexMCP.x - pinkyMCP.x, 2) + pow(indexMCP.y - pinkyMCP.y, 2))
    if palmWidth < 0.01 {
      return false  // Palm too narrow = likely not a hand
    }

    return true
  }

  private func processHandResults(_ result: HandLandmarkerResult) {
    // Avoid emitting events / sounds if view is tearing down.
    // Also check that callbacks are still valid (not nil) before processing
    guard isActive, !isShuttingDown, window != nil, onHandStatusChange != nil else { return }

    // Filter out invalid hand detections to reduce false positives
    let validLandmarks = result.landmarks.filter { isValidHandLandmarks($0) }
    let handCount = validLandmarks.count
    let allValid = handCount > 0 && validLandmarks.allSatisfy { $0.count >= 21 }

    // Create a filtered result for frame checking and overlay drawing
    let filteredResult = HandLandmarkerResult(
      landmarks: validLandmarks,
      worldLandmarks: [],  // Not used for our purposes
      handedness: Array(result.handedness.prefix(validLandmarks.count)),
      timestampInMilliseconds: result.timestampInMilliseconds
    )

    // Check if hands are fully in frame (with 5% margin) - use filtered result
    let handsInFrame = checkHandsInFrame(filteredResult)
    handsFullyInFrame = handsInFrame && handCount > 0
    
    // Check if any hand is partially out of frame (for beep logic)
    let hasPartialHand = handCount > 0 && !handsInFrame
    
    // Update state
    let previousHandInFrame = handInFrame
    handInFrame = handsInFrame && allValid
    
    // Update recording elapsed time
    if isRecording, !isPaused, let startTime = recordingStartTime {
      let totalElapsed = Date().timeIntervalSince(startTime) - pausedDuration
      recordingElapsedTime = totalElapsed
    }

    // Auto-pause/resume logic:
    // - Auto-pause if hand NOT in frame for 10 seconds continuously after recording starts
    // - Auto-resume when hand returns to frame
    if isRecording {
      if handInFrame {
        outOfFrameSince = nil
      } else {
        if outOfFrameSince == nil {
          outOfFrameSince = Date()
        }
        if let since = outOfFrameSince, !isPaused {
          let outDuration = Date().timeIntervalSince(since)
          if outDuration >= autoPauseThreshold {
            print("⚠️ Hand out of frame for \(autoPauseThreshold)s, auto-pausing...")
            pauseRecording()
          }
        }
      }
    }

    // If clap/voice start is enabled and we're not recording yet, keep listener state in sync.
    updateClapDetector()
    updateVoiceListener()
    
    // Beep logic: beep ONLY when hand is partially out of frame during recording
    // Requirements: No hands = no beep, Partial hand = beep (tick tick tick sound)
    // So: beep when there's at least one hand detected but it's partially out of frame
    // Use 0.2 second interval for rapid "tick tick tick" feedback
    // Only beep during active recording (not paused)
    if hasPartialHand {
      if isRecording && !isPaused {
        let now = Date()
        let beepInterval: TimeInterval = 0.2 // Faster ticking for better feedback
        if let lastBeep = lastBeepTime {
          let timeSinceLastBeep = now.timeIntervalSince(lastBeep)
          if timeSinceLastBeep >= beepInterval {
            // Use shared singleton directly to ensure it's never nil
            print("🔊 Playing beep - hand partially out of frame")
            BeepSoundService.shared.playBeep()
            lastBeepTime = now
          }
        } else {
          // First beep - play immediately
          print("🔊 Playing first beep - hand partially out of frame")
          BeepSoundService.shared.playBeep()
          lastBeepTime = now
        }
      }
    } else {
      // Reset beep timer when hands are fully in frame or no hands detected
      lastBeepTime = nil
    }
    
    // Send status to React Native
    // CRITICAL: Check shutdown state and callback validity before emitting
    // This prevents crashes when React Native bridge is deallocating
    // Check isShuttingDown FIRST - if shutting down, don't even try to call callback
    guard !isShuttingDown,
          canEmitEvents(), 
          window != nil, 
          let callback = onHandStatusChange else { 
      return // Don't emit if shutting down or callback is nil
    }
    
    // CRITICAL: Final check right before calling - shutdown might have happened
    // Even if callback exists, don't call it if we're shutting down
    // This prevents "instanceHandle is null" errors when React Native bridge is deallocating
    guard !isShuttingDown, isActive, window != nil else { return }
    
    // Only call callback if we're absolutely sure we're not shutting down
    // The callback might exist but React Native bridge might be gone, so we check again
    callback([
      "handCount": handCount,
      "valid": allValid,
      "handInFrame": handInFrame,
      "handsFullyInFrame": handsFullyInFrame,
      "isRecording": isRecording,
      "isPaused": isPaused,
      "recordingElapsedTime": recordingElapsedTime
    ])
    
    // Update overlay - use filtered landmarks to only show valid hands
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      let imageSize = self.cameraFeedService.videoResolution
      // Use the static method from OverlayView which handles handConnections internally
      // Use validLandmarks (filtered) instead of result.landmarks to avoid showing false positives
      let handOverlays = OverlayView.handOverlays(
        fromMultipleHandLandmarks: validLandmarks,
        inferredOnImageOfSize: imageSize,
        ovelayViewSize: self.overlayView.bounds.size,
        imageContentMode: .scaleAspectFit,
        andOrientation: .up
      )
      self.overlayView.draw(
        handOverlays: handOverlays,
        inBoundsOfContentImageOfSize: imageSize,
        edgeOffset: 0.0,
        imageContentMode: .scaleAspectFit
      )
    }
  }

  // MARK: - Voice Start
  private func updateVoiceListener() {
    // Only listen while view active, voice-start enabled, and NOT recording.
    guard isActive, enableVoiceStart, !isRecording, !isStartingRecording else {
      stopVoiceListener()
      return
    }
    // Already listening?
    if audioEngine.isRunning { return }
    startVoiceListenerIfPermitted()
  }

  private func startVoiceListenerIfPermitted() {
    SFSpeechRecognizer.requestAuthorization { [weak self] authStatus in
      guard let self = self else { return }
      if authStatus != .authorized {
        DispatchQueue.main.async {
          self.onError?(["message": "Speech recognition permission denied"])
        }
        return
      }

      DispatchQueue.main.async {
        self.startVoiceListener()
      }
    }
  }

  private func startVoiceListener() {
    guard !audioEngine.isRunning else { return }
    guard let recognizer = speechRecognizer, recognizer.isAvailable else {
      onError?(["message": "Speech recognizer not available"])
      return
    }

    // Cancel any prior task
    stopVoiceListener()

    // Configure audio session for speech recognition + camera coexistence.
    // This prevents AVAudioEngine from crashing due to invalid sample rate / channel count.
    do {
      try voiceAudioSession.setCategory(
        .playAndRecord,
        mode: .videoRecording,
        options: [.mixWithOthers, .allowBluetooth, .allowBluetoothA2DP, .defaultToSpeaker]
      )
      // Prefer mono input (speech) but don't fail if not supported.
      try? voiceAudioSession.setPreferredInputNumberOfChannels(1)
      try voiceAudioSession.setPreferredSampleRate(44100)
      try voiceAudioSession.setPreferredIOBufferDuration(0.01)
      try voiceAudioSession.setActive(true, options: .notifyOthersOnDeactivation)
    } catch {
      onError?(["message": "Failed to configure audio session for speech: \(error.localizedDescription)"])
      return
    }

    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = true
    speechRequest = request

    let inputNode = audioEngine.inputNode
    // Use input format after audio session activation.
    let recordingFormat = inputNode.inputFormat(forBus: 0)
    // Validate format (prevents IsFormatSampleRateAndChannelCountValid crash)
    if recordingFormat.sampleRate <= 0 || recordingFormat.channelCount == 0 {
      onError?(["message": "Invalid microphone format (sampleRate=\(recordingFormat.sampleRate), channels=\(recordingFormat.channelCount))"])
      stopVoiceListener()
      return
    }
    inputNode.removeTap(onBus: 0)
    inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
      // Defensive: ignore zero-length buffers (can happen during session transitions).
      guard buffer.frameLength > 0 else { return }
      self?.speechRequest?.append(buffer)
    }

    audioEngine.prepare()
    do {
      try audioEngine.start()
    } catch {
      onError?(["message": "Failed to start audio engine: \(error.localizedDescription)"])
      return
    }

    speechTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
      guard let self = self else { return }
      if let error = error {
        print("⚠️ Speech error: \(error.localizedDescription)")
        self.stopVoiceListener()
        if !self.isStartingRecording && self.isActive && self.enableVoiceStart && !self.isRecording {
          DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            self?.startVoiceListenerIfPermitted()
          }
        }
        return
      }

      guard let transcript = result?.bestTranscription.formattedString.lowercased() else { return }
      // Debug: see what recognizer is hearing
      if transcript.count > 0 {
        print("🗣️ Speech transcript: \(transcript)")
      }

      // Detect keyword "start" or "begin" or "record"
      let hasStartKeyword = transcript.contains("start") ||
                            transcript.contains("begin") ||
                            transcript.contains("record")

      if hasStartKeyword {
        // Debounce so it doesn't trigger repeatedly
        if let last = self.lastVoiceStartAt, Date().timeIntervalSince(last) < 2.0 {
          return
        }
        self.lastVoiceStartAt = Date()

        guard !self.isShuttingDown, self.window != nil, self.onVoiceCommand != nil else { return }

        // If requireHandsForVoiceStart is true, check for hands
        // But still start recording - just notify RN about the hand status
        if self.requireHandsForVoiceStart && !self.handsFullyInFrame {
          // Notify RN that hands aren't in frame, but still proceed with recording
          // The auto-pause feature will handle hands leaving frame during recording
          self.onVoiceCommand?([
            "command": "start",
            "accepted": true,
            "warning": "hands_not_in_frame"
          ])
        } else {
          self.onVoiceCommand?([
            "command": "start",
            "accepted": true
          ])
        }

        print("🎤 Voice command 'start' detected, starting recording...")

        // Stop listening to avoid repeated triggers, then start recording
        self.stopVoiceListener()
        self.startRecording()
      }
    }
  }

  private func stopVoiceListener() {
    // Safe to call multiple times - check if already stopped
    guard audioEngine.isRunning || speechTask != nil || speechRequest != nil else { return }

    if audioEngine.isRunning {
      audioEngine.stop()
    }
    audioEngine.inputNode.removeTap(onBus: 0)
    speechRequest?.endAudio()
    speechTask?.cancel()
    speechTask = nil
    speechRequest = nil
    // IMPORTANT:
    // Do not deactivate the shared AVAudioSession while recording, otherwise it can mute
    // video audio and also prevent TTS cues from being audible.
    // Also don't deactivate if we're shutting down (might cause issues during deinit)
    if !isRecording && !isShuttingDown {
      try? voiceAudioSession.setActive(false, options: [.notifyOthersOnDeactivation])
    }
  }

  // MARK: - Clap Detection
  private func updateClapDetector() {
    // Only listen while view active, clap-start enabled, and NOT recording.
    // Also check isShuttingDown to prevent restart during cleanup
    guard isActive, !isShuttingDown, enableClapStart, !isRecording, !isStartingRecording else {
      stopClapDetector()
      return
    }
    // Already listening?
    if audioRecorder?.isRecording == true { return }
    startClapDetector()
  }

  private func startClapDetector() {
    // CRITICAL: Check isShuttingDown before starting
    guard !isShuttingDown, audioRecorder?.isRecording != true else { return }

    // Configure audio session for clap detection + camera coexistence
    do {
      try clapAudioSession.setCategory(
        .playAndRecord,
        mode: .videoRecording,
        options: [.mixWithOthers, .allowBluetooth, .allowBluetoothA2DP, .defaultToSpeaker]
      )
      try clapAudioSession.setActive(true, options: .notifyOthersOnDeactivation)
    } catch {
      print("⚠️ Failed to configure audio session for clap detection: \(error.localizedDescription)")
      return
    }

    // Create a temporary file for the recorder (required but not used)
    let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("clap_detect.m4a")

    let settings: [String: Any] = [
      AVFormatIDKey: Int(kAudioFormatAppleLossless),
      AVSampleRateKey: 44100.0,
      AVNumberOfChannelsKey: 1,
      AVEncoderAudioQualityKey: AVAudioQuality.min.rawValue
    ]

    do {
      audioRecorder = try AVAudioRecorder(url: tempURL, settings: settings)
      audioRecorder?.isMeteringEnabled = true
      audioRecorder?.record()
      print("🎤 Clap detection started")

      // Start timer to check audio levels
      clapDetectionTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
        self?.checkForClap()
      }
    } catch {
      print("⚠️ Failed to start clap detector: \(error.localizedDescription)")
    }
  }

  private func checkForClap() {
    guard let recorder = audioRecorder, recorder.isRecording else { return }
    guard !isShuttingDown, isActive, !isRecording, !isStartingRecording else {
      stopClapDetector()
      return
    }

    recorder.updateMeters()
    let peakPower = recorder.peakPower(forChannel: 0)

    // Check if the sound is loud enough to potentially be a clap
    if peakPower > clapThreshold {
      consecutiveLoudSamples += 1

      // A real clap is impulsive - it's loud for only 1-3 samples (50-150ms at 50ms intervals)
      // Sustained loud sounds (like talking loudly) will have many consecutive samples
      // Only trigger on the FIRST loud sample to catch the impulsive nature of claps
      if consecutiveLoudSamples == 1 {
        // Check cooldown to avoid multiple triggers
        let now = Date()
        if let lastClap = lastClapTime, now.timeIntervalSince(lastClap) < clapCooldown {
          return
        }
        lastClapTime = now

        print("👏 Clap detected! Peak power: \(peakPower) dB")

        // CRITICAL: Set isStartingRecording SYNCHRONOUSLY before any async work
        // This prevents race conditions where the timer fires again before startRecording() sets the flag
        isStartingRecording = true

        // Stop clap detection before starting recording
        stopClapDetector()

        // Emit clap detected event and start recording
        DispatchQueue.main.async { [weak self] in
          guard let self = self, !self.isShuttingDown, self.window != nil else {
            // Reset flag if we can't proceed
            self?.isStartingRecording = false
            return
          }

          // Play confirmation sound
          self.beepSoundService?.playDing()

          // Emit clap detected callback
          if let callback = self.onClapDetected {
            callback(["accepted": true])
          }

          // Start recording (isStartingRecording is already set)
          self.startRecordingInternal(flagAlreadySet: true)
        }
      }
    } else {
      // Sound is quiet - reset consecutive counter
      consecutiveLoudSamples = 0
    }
  }

  private func stopClapDetector() {
    // Safe to call multiple times
    clapDetectionTimer?.invalidate()
    clapDetectionTimer = nil

    // Reset consecutive sample counter
    consecutiveLoudSamples = 0

    if let recorder = audioRecorder, recorder.isRecording {
      recorder.stop()
    }
    audioRecorder = nil

    // Don't deactivate audio session if recording, starting recording, or shutting down
    // When isStartingRecording is true, we need the session active for the ding sound
    if !isRecording && !isStartingRecording && !isShuttingDown {
      try? clapAudioSession.setActive(false, options: [.notifyOthersOnDeactivation])
    }
  }

  private func checkHandsInFrame(_ result: HandLandmarkerResult) -> Bool {
    // Use videoResolution from CameraFeedService
    let imageSize = cameraFeedService.videoResolution
    guard imageSize.width > 0 && imageSize.height > 0 else { return false }
    
    let margin: CGFloat = 0.05 // 5% margin
    let minX = imageSize.width * margin
    let maxX = imageSize.width * (1 - margin)
    let minY = imageSize.height * margin
    let maxY = imageSize.height * (1 - margin)
    
    for handLandmarks in result.landmarks {
      for landmark in handLandmarks {
        let x = CGFloat(landmark.x) * imageSize.width
        let y = CGFloat(landmark.y) * imageSize.height
        
        if x < minX || x > maxX || y < minY || y > maxY {
          return false // Hand is partially out of frame
        }
      }
    }
    
    return true // All hands fully in frame
  }
  
  // MARK: - Lifecycle
  override func willMove(toSuperview newSuperview: UIView?) {
    super.willMove(toSuperview: newSuperview)
    if newSuperview == nil {
      // CRITICAL: Set shutdown flag IMMEDIATELY, before any async work
      // This prevents any callbacks from being queued during the cleanup process
      isShuttingDown = true
      isActive = false

      // CRITICAL: Clear all React Native callbacks IMMEDIATELY
      // This must happen synchronously to prevent "instanceHandle is null" crashes
      // when React Navigation's header tries to dispatch events during view removal
      clearReactNativeCallbacks()

      // View is being removed - use synchronous shutdown to prevent crashes
      print("📱 View being removed from superview, stopping camera synchronously")
      if Thread.isMainThread {
        stopCameraAndClearCallbacks()
      } else {
        DispatchQueue.main.sync {
          stopCameraAndClearCallbacks()
        }
      }
    }
  }
  
  deinit {
    // Ensure cleanup happens even if willMove isn't called (e.g., app termination)
    print("🧹 HandCameraView.deinit called")

    // Set shutdown flags IMMEDIATELY - this is the most critical step
    // This prevents any async work from trying to emit events
    isShuttingDown = true
    isActive = false

    // Remove app lifecycle observers first
    NotificationCenter.default.removeObserver(self)

    // Clear callbacks immediately - they're about to become invalid
    // This is safe to do from any thread since we're just nilling out references
    onHandStatusChange = nil
    onReady = nil
    onError = nil
    onRecordingStarted = nil
    onRecordingPaused = nil
    onRecordingResumed = nil
    onRecordingCompleted = nil
    onVoiceCommand = nil

    // Clear service references to help with cleanup
    handLandmarkerService = nil
    beepSoundService = nil

    // Stop camera - but don't use sync dispatch in deinit as it can deadlock
    // The camera will be released when cameraFeedService is deallocated
    if let service = cameraFeedService {
      service.delegate = nil
      // Use async to avoid deadlock, but session will stop when deallocated anyway
      DispatchQueue.global(qos: .utility).async {
        service.stopSession()
      }
    }
  }
  
  override func layoutSubviews() {
    super.layoutSubviews()
    // Only update if not shutting down
    guard !isShuttingDown else { return }
    cameraFeedService?.updateVideoPreviewLayer(toFrame: bounds)
  }
}

// MARK: - CameraFeedServiceDelegate
extension HandCameraView: CameraFeedServiceDelegate {
  func didOutput(sampleBuffer: CMSampleBuffer, orientation: UIImage.Orientation) {
    // Early return if shutting down to prevent queuing more detection work
    // CRITICAL: Check shutdown state FIRST before any async work
    // NOTE: Do NOT check window here - it's a UI API and must be checked on main thread
    guard !isShuttingDown,
          isActive, 
          let service = handLandmarkerService,  // Use let binding to ensure service exists
          onHandStatusChange != nil else { return }
    
    // Skip processing if hand landmarker isn't ready yet (reduces initial lag)
    // This prevents queuing work before the service is fully initialized
    let currentTimeMs = Date().timeIntervalSince1970 * 1000
    
    backgroundQueue.async { [weak self] in
      // Double-check after async dispatch that we're still active and service exists
      // Also verify callback is still valid before queuing detection
      guard let self = self, 
            !self.isShuttingDown,
            self.isActive, 
            let service = self.handLandmarkerService,
            self.onHandStatusChange != nil else { return }
      service.detectAsync(
        sampleBuffer: sampleBuffer,
        orientation: orientation,
        timeStamps: Int(currentTimeMs)
      )
    }
  }
  
  func didEncounterSessionRuntimeError() {
    guard canEmitEvents(), !isShuttingDown, window != nil, onError != nil else { return }
    print("❌ Camera session runtime error")
    onError?(["message": "Camera session error"])
  }
  
  func sessionWasInterrupted(canResumeManually resumeManually: Bool) {
    print("⚠️ Camera session interrupted")
  }
  
  func sessionInterruptionEnded() {
    print("✅ Camera session interruption ended")
  }
}

// MARK: - HandLandmarkerServiceLiveStreamDelegate
extension HandCameraView: HandLandmarkerServiceLiveStreamDelegate {
  func handLandmarkerService(
    _ handLandmarkerService: HandLandmarkerService,
    didFinishDetection result: ResultBundle?,
    error: Error?
  ) {
    // CRITICAL: Check shutdown state FIRST - if shutting down, don't process anything
    // This prevents any events from being sent after stop() is called
    // Use a barrier to ensure atomic check
    if isShuttingDown {
      return // Silently return during shutdown
    }
    
    // Early return if not active
    // NOTE: Don't check window here - it's a UI API and this runs on background thread
    guard isActive else { return }
    
    // CRITICAL: Check callback exists BEFORE processing - if nil, don't dispatch at all
    // Capture callback reference immediately to check if it exists
    guard let callback = onHandStatusChange else { return }
    
    if let error = error {
      // Only log errors if we're not shutting down
      if !isShuttingDown {
        print("❌ Hand detection error: \(error.localizedDescription)")
      }
      return
    }
    
    guard let resultBundle = result,
          let handResult = resultBundle.handLandmarkerResults.first,
          let handLandmarkerResult = handResult else { return }
    
    // Use serial queue to process hand results - this ensures shutdown happens atomically
    // and prevents race conditions where stop() is called between check and dispatch
    handProcessingQueue.async { [weak self] in
      // CRITICAL: Check shutdown state FIRST - if shutting down, abort immediately
      // This check happens on a serial queue, so if stop() sets isShuttingDown,
      // this will see it (due to barrier in stop())
      guard let self = self, !self.isShuttingDown else { 
        // Silently return - we're shutting down, don't process anything
        return 
      }
      
      // CRITICAL: Check callback exists BEFORE any processing
      // If callback is nil, we're shutting down or already shut down
      guard !self.isShuttingDown, 
            self.isActive,
            self.onHandStatusChange != nil else { 
        // Callback is nil or we're shutting down - don't process
        return 
      }
      
      // CRITICAL: Capture shutdown state and callback BEFORE dispatching to main queue
      // This ensures we have a snapshot of the state at this moment
      let isCurrentlyShuttingDown = self.isShuttingDown
      let isCurrentlyActive = self.isActive
      let currentCallback = self.onHandStatusChange
      
      // CRITICAL: If we're shutting down or callback is nil, don't dispatch at all
      // This prevents the main queue dispatch from even being queued
      // This is the most important check - if shutdown has started, we must not dispatch
      guard !isCurrentlyShuttingDown, 
            isCurrentlyActive, 
            currentCallback != nil else { 
        // Don't dispatch if shutting down - this prevents the crash
        return 
      }
      
      // Double-check one more time - shutdown might have happened between the capture and here
      guard !self.isShuttingDown, self.isActive, self.onHandStatusChange != nil else { 
        return 
      }
      
      // CRITICAL: Only dispatch to main queue if we're absolutely sure we're not shutting down
      // and the callback is still valid. Once we dispatch, we can't prevent the callback from being called,
      // so we must be 100% certain at this point.
      DispatchQueue.main.async { [weak self] in
        // CRITICAL: Final check - shutdown might have happened between queues
        // Check shutdown FIRST before any other checks - this is the most critical check
        // If we're shutting down, the callback might be nil or the React Native bridge might be suspended
        guard let self = self,
              !self.isShuttingDown,  // Check shutdown FIRST - most important
              self.isActive, 
              self.window != nil,
              let callback = self.onHandStatusChange else { 
          // Silently return if shutting down - don't even try to process
          // The callback might exist but React Native bridge might be suspended
          return 
        }
        
        // One final check before processing - shutdown might have happened in the async block
        guard !self.isShuttingDown else { return }
        
        // CRITICAL: Check one more time right before calling the callback
        // The React Native bridge might have been suspended between the guard and here
        guard !self.isShuttingDown, self.onHandStatusChange != nil else { return }
        
        // Now process the results - we've verified multiple times that we're not shutting down
        self.processHandResults(handLandmarkerResult)
      }
    }
  }
}

// MARK: - AVCaptureFileOutputRecordingDelegate
extension HandCameraView: AVCaptureFileOutputRecordingDelegate {
  func fileOutput(
    _ output: AVCaptureFileOutput,
    didStartRecordingTo fileURL: URL,
    from connections: [AVCaptureConnection]
  ) {
    // Check if we're shutting down or callbacks are nil before processing
    guard canEmitEvents(), !isShuttingDown, window != nil else { return }
    print("✅ Recording started to: \(fileURL.path)")
    
    // Clear the starting flag since recording has actually started
    isStartingRecording = false
    
    cameraFeedService.applyPreferredZoomFactor()
    if pendingResumeEvent {
      pendingResumeEvent = false
      isPaused = false
      outOfFrameSince = nil
      guard onRecordingResumed != nil else { return }
      onRecordingResumed?([:])
    }
  }
  
  func fileOutput(
    _ output: AVCaptureFileOutput,
    didFinishRecordingTo outputFileURL: URL,
    from connections: [AVCaptureConnection],
    error: Error?
  ) {
    // Check if we're shutting down or callbacks are nil before processing
    guard canEmitEvents(), !isShuttingDown, window != nil else { return }
    
    // Always clear starting flag when recording finishes (success or error)
    isStartingRecording = false
    
    if let error = error {
      print("❌ Recording error: \(error.localizedDescription)")
      guard onError != nil else { return }
      onError?(["message": "Recording failed: \(error.localizedDescription)"])
      // If a resume attempt failed, revert to paused state so user can try again
      if pendingResumeEvent {
        pendingResumeEvent = false
        isPaused = true
      }
      return
    }
    
    print("✅ Segment finished: \(outputFileURL.path) (reason: \(pendingStopReason))")
    segmentURLs.append(outputFileURL)

    // Decide what to do next based on why we stopped
    let reason = pendingStopReason
    pendingStopReason = .none
    isStoppingSegment = false

    if reason == .pause {
      DispatchQueue.main.async { [weak self] in
        guard let self = self, !self.isShuttingDown, self.window != nil, self.onRecordingPaused != nil else { return }
        self.onRecordingPaused?([:])
      }
      // If resume was requested while stopping, resume now
      if resumeRequestedAfterStop {
        resumeRequestedAfterStop = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
          self?.resumeRecording()
        }
      }
      return
    }

    if reason == .stop {
      DispatchQueue.main.async { [weak self] in
        self?.finishRecordingAndEmit()
      }
      return
    }
  }
}
