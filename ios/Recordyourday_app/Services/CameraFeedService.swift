// Copyright 2023 The MediaPipe Authors.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import UIKit
import AVFoundation

// MARK: CameraFeedServiceDelegate Declaration
protocol CameraFeedServiceDelegate: AnyObject {

  /**
   This method delivers the pixel buffer of the current frame seen by the device's camera.
   */
  func didOutput(sampleBuffer: CMSampleBuffer, orientation: UIImage.Orientation)

  /**
   This method initimates that a session runtime error occured.
   */
  func didEncounterSessionRuntimeError()

  /**
   This method initimates that the session was interrupted.
   */
  func sessionWasInterrupted(canResumeManually resumeManually: Bool)

  /**
   This method initimates that the session interruption has ended.
   */
  func sessionInterruptionEnded()

}

/**
 This class manages all camera related functionality
 */
class CameraFeedService: NSObject {
  /**
   This enum holds the state of the camera initialization.
   */
  enum CameraConfigurationStatus {
    case success
    case failed
    case permissionDenied
  }

  // MARK: Public Instance Variables
  var videoResolution: CGSize {
    get {
      guard let size = imageBufferSize else {
        return CGSize.zero
      }
      let minDimension = min(size.width, size.height)
      let maxDimension = max(size.width, size.height)
      switch UIDevice.current.orientation {
        case .portrait:
          return CGSize(width: minDimension, height: maxDimension)
        case .landscapeLeft:
          fallthrough
        case .landscapeRight:
          return CGSize(width: maxDimension, height: minDimension)
        default:
          return CGSize(width: minDimension, height: maxDimension)
      }
    }
  }

  // Use aspect fit so ultra-wide isn't cropped (matches native 0.5x framing).
  let videoGravity = AVLayerVideoGravity.resizeAspect

  // MARK: Instance Variables
  private let session: AVCaptureSession = AVCaptureSession()
  private lazy var videoPreviewLayer = AVCaptureVideoPreviewLayer(session: session)
  let sessionQueue = DispatchQueue(label: "com.google.mediapipe.CameraFeedService.sessionQueue")
  private let cameraPosition: AVCaptureDevice.Position = .back
  // We want the 0.5x ultra-wide lens perspective.
  // NOTE: When using builtInUltraWideCamera directly, zoom 1.0 = native ultra-wide (0.5x equivalent)
  // When using builtInTripleCamera or builtInDualWideCamera, zoom 0.5 = ultra-wide lens
  // We detect which camera we have and set zoom accordingly
  private var preferredZoomFactor: CGFloat = 1.0 // Will be set based on camera type
  private var isUsingDirectUltraWide = false
  private(set) var cameraDevice: AVCaptureDevice?
  private var selectedDeviceDescription: String?
  
  // MARK: Public Accessors
  var captureSession: AVCaptureSession {
    return session
  }

  private var cameraConfigurationStatus: CameraConfigurationStatus = .failed
  private lazy var videoDataOutput = AVCaptureVideoDataOutput()
  private var isSessionRunning = false
  private var imageBufferSize: CGSize?


  // MARK: CameraFeedServiceDelegate
  weak var delegate: CameraFeedServiceDelegate?

  // MARK: Initializer
  init(previewView: UIView) {
    super.init()

    // Initializes the session
    session.sessionPreset = .high
    setUpPreviewView(previewView)

    attemptToConfigureSession()
    NotificationCenter.default.addObserver(
      self, selector: #selector(orientationChanged),
      name: UIDevice.orientationDidChangeNotification,
      object: nil)
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  private func setUpPreviewView(_ view: UIView) {
    videoPreviewLayer.videoGravity = videoGravity
    videoPreviewLayer.connection?.videoOrientation = .portrait
    videoPreviewLayer.frame = view.bounds
    view.layer.insertSublayer(videoPreviewLayer, at: 0)
    print("📺 Preview layer added, frame: \(videoPreviewLayer.frame), view bounds: \(view.bounds)")
  }

  // MARK: notification methods
  @objc func orientationChanged(notification: Notification) {
    switch UIImage.Orientation.from(deviceOrientation: UIDevice.current.orientation) {
    case .up:
      videoPreviewLayer.connection?.videoOrientation = .portrait
    case .left:
      videoPreviewLayer.connection?.videoOrientation = .landscapeRight
    case .right:
      videoPreviewLayer.connection?.videoOrientation = .landscapeLeft
    default:
      break
    }
  }

  // MARK: Session Start and End methods

  /**
   This method starts an AVCaptureSession based on whether the camera configuration was successful.
   */

  func startLiveCameraSession(_ completion: @escaping(_ cameraConfiguration: CameraConfigurationStatus) -> Void) {
    sessionQueue.async {
      switch self.cameraConfigurationStatus {
      case .success:
        self.addObservers()
        self.startSession()
        default:
          break
      }
      completion(self.cameraConfigurationStatus)
    }
  }

  /**
   This method stops a running an AVCaptureSession.
   */
  func stopSession() {
    self.removeObservers()
    sessionQueue.async {
      if self.session.isRunning {
        self.session.stopRunning()
        self.isSessionRunning = self.session.isRunning
      }
    }
  }
  
  /**
   This method stops a running AVCaptureSession synchronously.
   Use this during app termination or backgrounding to ensure the session is stopped before React Native is suspended.
   */
  func stopSessionSynchronously() {
    self.removeObservers()
    
    // Clear the video data output delegate immediately to stop receiving callbacks
    videoDataOutput.setSampleBufferDelegate(nil, queue: nil)
    
    // Stop the session synchronously on the session queue
    sessionQueue.sync {
      if self.session.isRunning {
        self.session.stopRunning()
        self.isSessionRunning = self.session.isRunning
      }
    }
  }

  /**
   This method resumes an interrupted AVCaptureSession.
   */
  func resumeInterruptedSession(withCompletion completion: @escaping (Bool) -> ()) {
    sessionQueue.async {
      self.startSession()

      DispatchQueue.main.async {
        completion(self.isSessionRunning)
      }
    }
  }

  func updateVideoPreviewLayer(toFrame frame: CGRect) {
    print("📐 Updating preview layer frame to: \(frame)")
    videoPreviewLayer.frame = frame
  }

  /**
   This method starts the AVCaptureSession
   **/
  private func startSession() {
    self.session.startRunning()
    self.isSessionRunning = self.session.isRunning
  }

  // MARK: Session Configuration Methods.
  /**
   This method requests for camera permissions and handles the configuration of the session and stores the result of configuration.
   */
  private func attemptToConfigureSession() {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      self.cameraConfigurationStatus = .success
    case .notDetermined:
      self.sessionQueue.suspend()
      self.requestCameraAccess(completion: { (granted) in
        self.sessionQueue.resume()
      })
    case .denied:
      self.cameraConfigurationStatus = .permissionDenied
    default:
      break
    }

    self.sessionQueue.async {
      self.configureSession()
    }
  }

  /**
   This method requests for camera permissions.
   */
  private func requestCameraAccess(completion: @escaping (Bool) -> ()) {
    AVCaptureDevice.requestAccess(for: .video) { (granted) in
      if !granted {
        self.cameraConfigurationStatus = .permissionDenied
      }
      else {
        self.cameraConfigurationStatus = .success
      }
      completion(granted)
    }
  }


  /**
   This method handles all the steps to configure an AVCaptureSession.
   */
  private func configureSession() {

    guard cameraConfigurationStatus == .success else {
      return
    }
    session.beginConfiguration()

    // Tries to add an AVCaptureDeviceInput.
    guard addVideoDeviceInput() == true else {
      self.session.commitConfiguration()
      self.cameraConfigurationStatus = .failed
      return
    }

    // Tries to add an AVCaptureAudioDeviceInput for recording audio.
    if !addAudioDeviceInput() {
      print("⚠️ Audio input not available - recording will be video only")
    }

    // Tries to add an AVCaptureVideoDataOutput.
    guard addVideoDataOutput() else {
      self.session.commitConfiguration()
      self.cameraConfigurationStatus = .failed
      return
    }

    session.commitConfiguration()
    self.cameraConfigurationStatus = .success
  }

  /**
   This method tries to an AVCaptureDeviceInput to the current AVCaptureSession.
   */
  private func addVideoDeviceInput() -> Bool {

    guard let camera = preferredCameraDevice() else {
      print("❌ No camera device available")
      return false
    }

    do {
      cameraDevice = camera
      selectedDeviceDescription = "\(camera.deviceType.rawValue) | fov=\(camera.activeFormat.videoFieldOfView)"
      do {
        try setZoomFactor(preferredZoomFactor, for: camera)
      } catch {
        print("⚠️ Unable to set camera zoom: \(error)")
      }
      let videoDeviceInput = try AVCaptureDeviceInput(device: camera)
      if session.canAddInput(videoDeviceInput) {
        session.addInput(videoDeviceInput)
        return true
      } else {
        print("❌ Cannot add video device input to session")
        return false
      }
    } catch {
      // Log error instead of crashing - graceful degradation
      print("❌ Cannot create video device input: \(error.localizedDescription)")
      return false
    }
  }

  /**
   This method tries to add an AVCaptureDeviceInput for audio to the current AVCaptureSession.
   */
  private func addAudioDeviceInput() -> Bool {
    // Check microphone permission
    switch AVCaptureDevice.authorizationStatus(for: .audio) {
    case .authorized:
      break
    case .notDetermined:
      // Request permission synchronously - will block until user responds
      var granted = false
      let semaphore = DispatchSemaphore(value: 0)
      AVCaptureDevice.requestAccess(for: .audio) { result in
        granted = result
        semaphore.signal()
      }
      semaphore.wait()
      if !granted {
        print("⚠️ Microphone permission denied")
        return false
      }
    case .denied, .restricted:
      print("⚠️ Microphone permission denied or restricted")
      return false
    @unknown default:
      print("⚠️ Unknown microphone authorization status")
      return false
    }

    guard let audioDevice = AVCaptureDevice.default(for: .audio) else {
      print("⚠️ No audio device available")
      return false
    }

    do {
      let audioDeviceInput = try AVCaptureDeviceInput(device: audioDevice)
      if session.canAddInput(audioDeviceInput) {
        session.addInput(audioDeviceInput)
        print("🎤 Audio input added successfully")
        return true
      } else {
        print("⚠️ Cannot add audio device input to session")
        return false
      }
    } catch {
      print("⚠️ Cannot create audio device input: \(error.localizedDescription)")
      return false
    }
  }

  private func preferredCameraDevice() -> AVCaptureDevice? {
    // Priority 1: Direct ultra-wide camera (0.5x native)
    // When using ultra-wide directly, zoom 1.0 IS the 0.5x perspective
    if let ultraWide = AVCaptureDevice.default(.builtInUltraWideCamera, for: .video, position: cameraPosition) {
      print("📷 Using ultra-wide camera directly (native 0.5x perspective)")
      isUsingDirectUltraWide = true
      preferredZoomFactor = 1.0 // 1.0 on ultra-wide = 0.5x equivalent
      return ultraWide
    }

    // Priority 2: Triple camera system (has ultra-wide, wide, telephoto)
    // This allows software zoom to 0.5x using the ultra-wide lens
    if let tripleCamera = AVCaptureDevice.default(.builtInTripleCamera, for: .video, position: cameraPosition) {
      print("📷 Using triple camera system (will zoom to 0.5x)")
      isUsingDirectUltraWide = false
      preferredZoomFactor = 0.5
      return tripleCamera
    }

    // Priority 3: Dual wide camera (has ultra-wide + wide)
    if let dualWide = AVCaptureDevice.default(.builtInDualWideCamera, for: .video, position: cameraPosition) {
      print("📷 Using dual wide camera (will zoom to 0.5x)")
      isUsingDirectUltraWide = false
      preferredZoomFactor = 0.5
      return dualWide
    }

    // Priority 4: Regular dual camera
    if let dualCamera = AVCaptureDevice.default(.builtInDualCamera, for: .video, position: cameraPosition) {
      print("📷 Using dual camera (no ultra-wide)")
      isUsingDirectUltraWide = false
      preferredZoomFactor = 1.0
      return dualCamera
    }

    // Fallback: Standard wide angle camera (no 0.5x support)
    if let wideCamera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: cameraPosition) {
      print("📷 Using wide angle camera (no 0.5x available)")
      isUsingDirectUltraWide = false
      preferredZoomFactor = 1.0
      return wideCamera
    }

    // Last resort: Discovery session
    let deviceTypes: [AVCaptureDevice.DeviceType] = [
      .builtInTripleCamera,
      .builtInDualWideCamera,
      .builtInDualCamera,
      .builtInUltraWideCamera,
      .builtInWideAngleCamera
    ]

    let discoverySession = AVCaptureDevice.DiscoverySession(
      deviceTypes: deviceTypes,
      mediaType: .video,
      position: cameraPosition
    )

    print("📷 Using first available camera from discovery")
    isUsingDirectUltraWide = false
    preferredZoomFactor = 1.0
    return discoverySession.devices.first
  }

  func applyPreferredZoomFactor() {
    sessionQueue.async { [weak self] in
      guard let self = self else { return }
      let inputDevice = self.session.inputs
        .compactMap { $0 as? AVCaptureDeviceInput }
        .first?
        .device
      guard let camera = self.cameraDevice ?? inputDevice else { return }
      do {
        try self.setZoomFactor(self.preferredZoomFactor, for: camera)
      } catch {
        print("⚠️ Unable to reapply camera zoom: \(error)")
      }
    }
  }

  private func setZoomFactor(_ zoomFactor: CGFloat, for camera: AVCaptureDevice) throws {
    try camera.lockForConfiguration()
    defer { camera.unlockForConfiguration() }

    let minZoom = camera.minAvailableVideoZoomFactor
    let maxZoom = camera.maxAvailableVideoZoomFactor
    let clampedZoom = max(minZoom, min(zoomFactor, maxZoom))

    if camera.videoZoomFactor != clampedZoom {
      camera.videoZoomFactor = clampedZoom
    }

    // Better logging based on camera type
    if isUsingDirectUltraWide {
      // When using ultra-wide directly, zoom 1.0 = 0.5x equivalent
      print("📷 Ultra-wide camera at native zoom (equivalent to 0.5x perspective)")
    } else if clampedZoom == zoomFactor {
      print("📷 Zoom set to \(clampedZoom)x")
    } else {
      print("📷 Zoom set to \(clampedZoom)x (requested: \(zoomFactor)x, range: \(minZoom)x-\(maxZoom)x)")
    }
  }

  /**
   This method tries to an AVCaptureVideoDataOutput to the current AVCaptureSession.
   */
  private func addVideoDataOutput() -> Bool {

    let sampleBufferQueue = DispatchQueue(label: "sampleBufferQueue")
    videoDataOutput.setSampleBufferDelegate(self, queue: sampleBufferQueue)
    videoDataOutput.alwaysDiscardsLateVideoFrames = true
    videoDataOutput.videoSettings = [ String(kCVPixelBufferPixelFormatTypeKey) : kCMPixelFormat_32BGRA]

    if session.canAddOutput(videoDataOutput) {
      session.addOutput(videoDataOutput)
      videoDataOutput.connection(with: .video)?.videoOrientation = .portrait
      videoDataOutput.connection(with: .video)?.preferredVideoStabilizationMode = .off
      if videoDataOutput.connection(with: .video)?.isVideoOrientationSupported == true
          && cameraPosition == .front {
        videoDataOutput.connection(with: .video)?.isVideoMirrored = true
      }
      return true
    }
    return false
  }

  // MARK: Notification Observer Handling
  private func addObservers() {
    NotificationCenter.default.addObserver(self, selector: #selector(CameraFeedService.sessionRuntimeErrorOccured(notification:)), name: NSNotification.Name.AVCaptureSessionRuntimeError, object: session)
    NotificationCenter.default.addObserver(self, selector: #selector(CameraFeedService.sessionWasInterrupted(notification:)), name: NSNotification.Name.AVCaptureSessionWasInterrupted, object: session)
    NotificationCenter.default.addObserver(self, selector: #selector(CameraFeedService.sessionInterruptionEnded), name: NSNotification.Name.AVCaptureSessionInterruptionEnded, object: session)
  }

  private func removeObservers() {
    NotificationCenter.default.removeObserver(self, name: NSNotification.Name.AVCaptureSessionRuntimeError, object: session)
    NotificationCenter.default.removeObserver(self, name: NSNotification.Name.AVCaptureSessionWasInterrupted, object: session)
    NotificationCenter.default.removeObserver(self, name: NSNotification.Name.AVCaptureSessionInterruptionEnded, object: session)
  }

  // MARK: Notification Observers
  @objc func sessionWasInterrupted(notification: Notification) {

    if let userInfoValue = notification.userInfo?[AVCaptureSessionInterruptionReasonKey] as AnyObject?,
       let reasonIntegerValue = userInfoValue.integerValue,
       let reason = AVCaptureSession.InterruptionReason(rawValue: reasonIntegerValue) {
      print("Capture session was interrupted with reason \(reason)")

      var canResumeManually = false
      if reason == .videoDeviceInUseByAnotherClient {
        canResumeManually = true
      } else if reason == .videoDeviceNotAvailableWithMultipleForegroundApps {
        canResumeManually = false
      }

      self.delegate?.sessionWasInterrupted(canResumeManually: canResumeManually)

    }
  }

  @objc func sessionInterruptionEnded(notification: Notification) {
    self.delegate?.sessionInterruptionEnded()
  }

  @objc func sessionRuntimeErrorOccured(notification: Notification) {
    guard let error = notification.userInfo?[AVCaptureSessionErrorKey] as? AVError else {
      return
    }

    print("Capture session runtime error: \(error)")

    guard error.code == .mediaServicesWereReset else {
      self.delegate?.didEncounterSessionRuntimeError()
      return
    }

    sessionQueue.async {
      if self.isSessionRunning {
        self.startSession()
      } else {
        DispatchQueue.main.async {
          self.delegate?.didEncounterSessionRuntimeError()
        }
      }
    }
  }
}

/**
 AVCaptureVideoDataOutputSampleBufferDelegate
 */
extension CameraFeedService: AVCaptureVideoDataOutputSampleBufferDelegate {

  /** This method delegates the CVPixelBuffer of the frame seen by the camera currently.
   */
  func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    // Safe unwrap to prevent crashes if imageBuffer is nil
    guard let imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
      return
    }
    if imageBufferSize == nil {
      imageBufferSize = CGSize(width: CVPixelBufferGetHeight(imageBuffer), height: CVPixelBufferGetWidth(imageBuffer))
    }
    delegate?.didOutput(sampleBuffer: sampleBuffer, orientation: UIImage.Orientation.from(deviceOrientation: UIDevice.current.orientation))
  }
}

// MARK: UIImage.Orientation Extension
extension UIImage.Orientation {
  static func from(deviceOrientation: UIDeviceOrientation) -> UIImage.Orientation {
    switch deviceOrientation {
      case .portrait:
        return .up
      case .landscapeLeft:
        return .left
      case .landscapeRight:
        return .right
      default:
        return .up
    }
  }
}
