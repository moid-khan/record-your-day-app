import Foundation
import AVFoundation
import AudioToolbox
import UIKit
import CoreHaptics

/// Service to provide audio + haptic feedback for recording events
/// Uses AVAudioEngine for direct audio output during recording
class BeepSoundService {
  static let shared = BeepSoundService()

  private var isPlaying = false

  // AVAudioEngine for direct audio output
  private var audioEngine: AVAudioEngine?
  private var playerNode: AVAudioPlayerNode?
  private var beepBuffer: AVAudioPCMBuffer?

  // CoreHaptics engine for haptic feedback
  private var hapticEngine: CHHapticEngine?

  // Haptic generators
  private var impactGenerator: UIImpactFeedbackGenerator?
  private var notificationGenerator: UINotificationFeedbackGenerator?

  // Callback for visual feedback
  var onWarningFlash: (() -> Void)?

  private init() {
    // Log device info for debugging
    let device = UIDevice.current
    print("📱 Device: \(device.model) - \(device.systemName) \(device.systemVersion)")
    print("📱 Device name: \(device.name)")

    // Check if this is an iPad (no vibration motor)
    let isIPad = device.userInterfaceIdiom == .pad
    print("📱 Is iPad: \(isIPad) - Note: iPads don't have vibration motors!")

    setupAudioEngine()
    setupHaptics()
    print("✅ BeepSoundService initialized")
  }

  /// Setup AVAudioEngine for beep playback
  private func setupAudioEngine() {
    audioEngine = AVAudioEngine()
    playerNode = AVAudioPlayerNode()

    guard let engine = audioEngine, let player = playerNode else {
      print("❌ Failed to create audio engine")
      return
    }

    engine.attach(player)

    // Generate beep buffer
    let sampleRate: Double = 44100
    let duration: Double = 0.2  // 200ms beep
    let frequency: Double = 1000  // 1kHz - very noticeable

    let numSamples = Int(sampleRate * duration)
    let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1)!

    guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(numSamples)) else {
      print("❌ Failed to create audio buffer")
      return
    }
    buffer.frameLength = AVAudioFrameCount(numSamples)

    // Generate sine wave with envelope
    let channelData = buffer.floatChannelData![0]
    for i in 0..<numSamples {
      let t = Double(i) / sampleRate
      let amplitude: Float = 0.9

      // Fade envelope to avoid clicks
      var envelope: Float = 1.0
      let fadeLength = 0.02
      if t < fadeLength {
        envelope = Float(t / fadeLength)
      } else if t > duration - fadeLength {
        envelope = Float((duration - t) / fadeLength)
      }

      channelData[i] = amplitude * envelope * Float(sin(2.0 * .pi * frequency * t))
    }

    beepBuffer = buffer

    // Connect player to main mixer
    let mainMixer = engine.mainMixerNode
    engine.connect(player, to: mainMixer, format: format)

    // Set output volume high
    mainMixer.outputVolume = 1.0

    print("✅ Audio engine setup complete: \(duration)s beep at \(frequency)Hz")
  }

  private func startEngineIfNeeded() {
    guard let engine = audioEngine else { return }

    if !engine.isRunning {
      do {
        // Log current audio session state (DON'T modify it - recording has already configured it)
        let session = AVAudioSession.sharedInstance()
        print("🔊 Current audio session category: \(session.category.rawValue)")
        print("🔊 Current audio session mode: \(session.mode.rawValue)")
        print("🔊 Current audio session options: \(session.categoryOptions.rawValue)")
        print("🔊 Is other audio playing: \(session.isOtherAudioPlaying)")

        // DON'T reconfigure audio session - it's already set up by recording
        // Just try to start the engine with the existing session
        try engine.start()
        print("✅ Audio engine started (using existing audio session)")
      } catch {
        print("❌ Failed to start audio engine: \(error)")
        // Try one more time without any audio session changes
        do {
          try engine.start()
          print("✅ Audio engine started on retry")
        } catch {
          print("❌ Audio engine failed on retry: \(error)")
        }
      }
    }
  }

  private func setupHaptics() {
    // Create haptic generators and prepare them
    impactGenerator = UIImpactFeedbackGenerator(style: .heavy)
    notificationGenerator = UINotificationFeedbackGenerator()

    // Prepare generators on main thread
    DispatchQueue.main.async { [weak self] in
      self?.impactGenerator?.prepare()
      self?.notificationGenerator?.prepare()
    }

    // Log device haptic capabilities
    let supportsHaptics = CHHapticEngine.capabilitiesForHardware().supportsHaptics
    print("📳 Device supports haptics: \(supportsHaptics)")

    // Setup CoreHaptics engine
    if supportsHaptics {
      do {
        hapticEngine = try CHHapticEngine()
        hapticEngine?.playsHapticsOnly = true
        hapticEngine?.stoppedHandler = { [weak self] reason in
          print("⚠️ Haptic engine stopped: \(reason.rawValue)")
          DispatchQueue.main.async {
            self?.restartHapticEngine()
          }
        }
        hapticEngine?.resetHandler = { [weak self] in
          print("⚠️ Haptic engine reset")
          DispatchQueue.main.async {
            self?.restartHapticEngine()
          }
        }
        try hapticEngine?.start()
        print("✅ CoreHaptics engine started")
      } catch {
        print("⚠️ CoreHaptics not available: \(error)")
      }
    }
  }

  private func restartHapticEngine() {
    guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else { return }
    do {
      try hapticEngine?.start()
      print("✅ Haptic engine restarted")
    } catch {
      print("⚠️ Failed to restart haptic engine: \(error)")
    }
  }

  /// Play a confirmation ding when recording successfully starts.
  func playDing() {
    DispatchQueue.main.async { [weak self] in
      AudioServicesPlaySystemSound(1103)
      self?.notificationGenerator?.notificationOccurred(.success)
    }
  }

  /// Play warning beep for hand-out-of-frame during recording
  func playBeep() {
    // Ensure we're on main thread
    guard Thread.isMainThread else {
      DispatchQueue.main.async { [weak self] in
        self?.playBeep()
      }
      return
    }

    // Prevent overlapping beeps
    guard !isPlaying else {
      print("⚠️ Beep already playing, skipping")
      return
    }
    isPlaying = true

    print("🔊 === BEEP TRIGGERED ===")

    // ===== 1. VIBRATION via AudioServices =====
    // This should work regardless of audio session
    print("📳 Triggering vibration via AudioServicesPlaySystemSound...")
    AudioServicesPlaySystemSoundWithCompletion(kSystemSoundID_Vibrate) {
      print("📳 Vibration completed")
    }

    // Also try alert sound vibration pattern (3 short vibrations)
    AudioServicesPlayAlertSoundWithCompletion(4095) { // Custom vibration pattern
      print("📳 Alert vibration completed")
    }

    // ===== 2. HAPTIC FEEDBACK via UIKit =====
    print("📳 Triggering UIKit haptics...")
    impactGenerator?.impactOccurred(intensity: 1.0)
    notificationGenerator?.notificationOccurred(.error)

    // Prepare for next use
    impactGenerator?.prepare()
    notificationGenerator?.prepare()

    // ===== 3. CoreHaptics Pattern =====
    playStrongHapticPattern()

    // ===== 4. AUDIO via AVAudioEngine =====
    print("🔊 Triggering audio via AVAudioEngine...")
    playBeepSound()

    // ===== 5. FALLBACK System Sound =====
    // Try system sounds as backup
    print("🔊 Triggering system sound 1005 (alarm)...")
    AudioServicesPlayAlertSoundWithCompletion(1005) {
      print("🔊 System sound 1005 completed")
    }

    // Also try the loud new mail sound
    AudioServicesPlaySystemSound(1007)  // New mail received

    // ===== 6. VISUAL FEEDBACK =====
    onWarningFlash?()

    print("🔊 === BEEP COMPLETE ===")

    // Reset flag after delay
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
      self?.isPlaying = false
    }
  }

  private func playBeepSound() {
    guard let engine = audioEngine, let player = playerNode, let buffer = beepBuffer else {
      print("❌ Audio engine components not ready")
      return
    }

    // Start engine if needed
    startEngineIfNeeded()

    guard engine.isRunning else {
      print("❌ Audio engine not running")
      return
    }

    // Stop any current playback
    player.stop()

    // Schedule and play buffer
    player.scheduleBuffer(buffer, at: nil, options: .interrupts) {
      print("🔊 Audio buffer playback completed")
    }
    player.play()
    print("🔊 Audio player started")
  }

  /// Play a strong haptic pattern using CoreHaptics
  private func playStrongHapticPattern() {
    guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else {
      print("📳 Device doesn't support haptics")
      return
    }

    guard let engine = hapticEngine else {
      print("⚠️ Haptic engine not available")
      return
    }

    // Try to start engine
    do {
      try engine.start()
    } catch {
      print("⚠️ Failed to start haptic engine: \(error)")
    }

    do {
      let sharpness = CHHapticEventParameter(parameterID: .hapticSharpness, value: 1.0)
      let intensity = CHHapticEventParameter(parameterID: .hapticIntensity, value: 1.0)

      // Strong pattern with multiple pulses
      let events = [
        CHHapticEvent(eventType: .hapticTransient, parameters: [intensity, sharpness], relativeTime: 0),
        CHHapticEvent(eventType: .hapticTransient, parameters: [intensity, sharpness], relativeTime: 0.05),
        CHHapticEvent(eventType: .hapticTransient, parameters: [intensity, sharpness], relativeTime: 0.1),
        CHHapticEvent(eventType: .hapticContinuous, parameters: [intensity, sharpness], relativeTime: 0.15, duration: 0.1)
      ]

      let pattern = try CHHapticPattern(events: events, parameters: [])
      let player = try engine.makePlayer(with: pattern)
      try player.start(atTime: CHHapticTimeImmediate)
      print("📳 CoreHaptics pattern started")
    } catch {
      print("⚠️ CoreHaptics playback failed: \(error)")
    }
  }

  func stopBeep() {
    isPlaying = false
    playerNode?.stop()
  }

  /// Test function to verify sound and vibration work
  /// Call this from a button tap BEFORE starting recording to verify hardware works
  func testSoundAndVibration() {
    print("🧪 === TESTING SOUND AND VIBRATION ===")
    print("🧪 This should produce sound AND vibration")

    // Test vibration
    print("🧪 Testing vibration...")
    AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)

    // Test system sound
    print("🧪 Testing system sound 1007...")
    AudioServicesPlaySystemSound(1007)

    // Test haptic
    print("🧪 Testing haptic...")
    impactGenerator?.impactOccurred(intensity: 1.0)

    // Test alert sound (respects silent mode)
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
      print("🧪 Testing alert sound 1005...")
      AudioServicesPlayAlertSound(1005)
    }

    // Test our generated beep
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
      print("🧪 Testing AVAudioEngine beep...")
      self?.playBeepSound()
    }

    print("🧪 === TEST COMPLETE - Did you hear/feel anything? ===")
  }
}
