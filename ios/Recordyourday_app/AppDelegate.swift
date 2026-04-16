import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import Speech
import RNBootSplash // ⬅️ add this import

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Ask Speech Recognition permission on app launch (required for voice "start" command)
    SFSpeechRecognizer.requestAuthorization { _ in }

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "Recordyourday_app",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }
  
  // MARK: - App Lifecycle Methods
  
  func applicationWillResignActive(_ application: UIApplication) {
    // App is about to become inactive (e.g., phone call, notification)
    // Post notification to allow native views to clean up React Native callbacks
    // This must happen BEFORE React Native is suspended
    NotificationCenter.default.post(name: NSNotification.Name("AppWillResignActive"), object: nil)
  }
  
  func applicationDidEnterBackground(_ application: UIApplication) {
    // App entered background - notify native views to clean up immediately
    // This must happen synchronously on main thread BEFORE React Native suspension
    NotificationCenter.default.post(name: NSNotification.Name("AppDidEnterBackground"), object: nil)
    
    // Give native views a moment to clear callbacks, then suspend React Native
    // Use a small delay to ensure cleanup completes
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
      // React Native will automatically suspend when app enters background
      // The notification above ensures all callbacks are cleared first
    }
  }
  
  func applicationWillTerminate(_ application: UIApplication) {
    // App is about to terminate - emergency cleanup
    // Post notification immediately so native views can clear callbacks
    NotificationCenter.default.post(name: NSNotification.Name("AppWillTerminate"), object: nil)
    
    // Give a brief moment for cleanup (but don't wait too long)
    // The system will terminate the app regardless
    RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.05))
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

   override func customize(_ rootView: RCTRootView) {
    super.customize(rootView)
    RNBootSplash.initWithStoryboard("BootSplash", rootView: rootView) // ⬅️ initialize the splash screen
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
