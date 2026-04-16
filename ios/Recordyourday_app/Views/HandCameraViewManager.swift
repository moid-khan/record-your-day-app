// Paper ViewManager for HandCameraView
// Works with Fabric through React Native's interop layer

import UIKit
import React

@objc(HandCameraViewManager)
class HandCameraViewManager: RCTViewManager {

  override func view() -> UIView! {
    return HandCameraView()
  }

  override static func requiresMainQueueSetup() -> Bool {
    return true
  }

  override func constantsToExport() -> [AnyHashable : Any]! {
    return [:]
  }

  @objc
  func start(_ node: NSNumber) {
    DispatchQueue.main.async {
      guard let view = self.bridge.uiManager.view(forReactTag: node) as? HandCameraView else {
        return
      }
      view.start()
    }
  }

  @objc
  func stop(_ node: NSNumber) {
    DispatchQueue.main.async {
      guard let view = self.bridge.uiManager.view(forReactTag: node) as? HandCameraView else {
        return
      }
      view.stop()
    }
  }

  @objc
  func startRecording(_ node: NSNumber) {
    DispatchQueue.main.async {
      guard let view = self.bridge.uiManager.view(forReactTag: node) as? HandCameraView else {
        return
      }
      view.startRecording()
    }
  }

  @objc
  func pauseRecording(_ node: NSNumber) {
    DispatchQueue.main.async {
      guard let view = self.bridge.uiManager.view(forReactTag: node) as? HandCameraView else {
        return
      }
      view.pauseRecording()
    }
  }

  @objc
  func resumeRecording(_ node: NSNumber) {
    DispatchQueue.main.async {
      guard let view = self.bridge.uiManager.view(forReactTag: node) as? HandCameraView else {
        return
      }
      view.resumeRecording()
    }
  }

  @objc
  func stopRecording(_ node: NSNumber) {
    DispatchQueue.main.async {
      guard let view = self.bridge.uiManager.view(forReactTag: node) as? HandCameraView else {
        return
      }
      view.stopRecording()
    }
  }

  @objc
  func speakCue(_ node: NSNumber, text: NSString) {
    DispatchQueue.main.async {
      guard let view = self.bridge.uiManager.view(forReactTag: node) as? HandCameraView else {
        return
      }
      view.speakCue(text: text as String)
    }
  }

  @objc
  func testBeep(_ node: NSNumber) {
    DispatchQueue.main.async {
      // Test sound and vibration directly - doesn't require the view
      BeepSoundService.shared.testSoundAndVibration()
    }
  }
}
