// Kiri patch of @capacitor/privacy-screen 2.0.1 (DECISIONS.md D-25, lock audit P2-2).
// Applied to node_modules by scripts/patch-privacy-screen.mjs (postinstall and npm run ios:build).
// Upstream problems fixed here:
//   1. enable()/disable()/isEnabled() ran UIKit code (dismiss) on the Capacitor bridge thread -> crash.
//      Every UIKit touch and every state read/write now happens on the main queue.
//   2. The cover was a modally presented view controller. A quick resignActive -> becomeActive
//      (the Face ID sheet) could dismiss it while its presentation was still in progress, leaving an
//      invisible presented controller behind; the share sheet then could not be presented
//      ("sharing is in progress"). The cover is now a plain view added to the key window and removed
//      synchronously, so it never takes part in view controller presentation.
//   3. enable() while the app is already inactive/in the background covers the screen at once
//      (upstream only covered on the next willResignActive).
// JS API and behaviour otherwise unchanged (enable/disable/isEnabled, ios.blurEffect light|dark|none).
import Foundation
import Capacitor
import UIKit

@objc(PrivacyScreenPlugin)
public class PrivacyScreenPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PrivacyScreenPlugin"
    public let jsName = "PrivacyScreen"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "enable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isEnabled", returnType: CAPPluginReturnPromise)
    ]

    // Main queue only.
    private var isEnabled = false
    private var protectionView: UIView?
    private var blurEffect: UIBlurEffect.Style?

    override public func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(applicationDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(applicationWillResignActive),
            name: UIApplication.willResignActiveNotification,
            object: nil
        )
    }

    @objc func enable(_ call: CAPPluginCall) {
        var style: UIBlurEffect.Style?
        var hasStyle = false
        if let config = call.getObject("ios"),
           let blurEffectString = config["blurEffect"] as? String {
            hasStyle = true
            switch blurEffectString {
            case "light":
                style = .light
            case "dark":
                style = .dark
            default:
                style = nil
            }
        }

        DispatchQueue.main.async {
            if hasStyle {
                self.blurEffect = style
            }
            self.isEnabled = true
            if UIApplication.shared.applicationState != .active {
                self.obscureScreen()
            }
            call.resolve(["success": true])
        }
    }

    @objc func disable(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.isEnabled = false
            self.unobscureScreen()
            call.resolve(["success": true])
        }
    }

    @objc func isEnabled(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["enabled": self.isEnabled])
        }
    }

    private func obscureScreen() {
        dispatchPrecondition(condition: .onQueue(.main))
        guard protectionView == nil, let window = getKeyWindow() else {
            return
        }
        let view = createProtectionView(frame: window.bounds)
        window.addSubview(view)
        window.bringSubviewToFront(view)
        protectionView = view
    }

    private func unobscureScreen() {
        dispatchPrecondition(condition: .onQueue(.main))
        protectionView?.removeFromSuperview()
        protectionView = nil
    }

    private func createProtectionView(frame: CGRect) -> UIView {
        let container = UIView(frame: frame)
        container.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        container.isUserInteractionEnabled = false

        if let blurEffect = blurEffect {
            let blurEffectView = UIVisualEffectView(effect: UIBlurEffect(style: blurEffect))
            blurEffectView.frame = container.bounds
            blurEffectView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            container.addSubview(blurEffectView)
        } else if let launchImage = UIImage(named: "LaunchImage") ?? UIImage(named: "Splash") {
            let imageView = UIImageView(image: launchImage)
            imageView.frame = container.bounds
            imageView.contentMode = .scaleAspectFill
            imageView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            container.addSubview(imageView)
        } else if let launchStoryboard = Bundle.main.object(forInfoDictionaryKey: "UILaunchStoryboardName") as? String,
                  let launchVC = UIStoryboard(name: launchStoryboard, bundle: nil).instantiateInitialViewController() {
            container.backgroundColor = launchVC.view.backgroundColor
        } else {
            container.backgroundColor = .white
        }

        return container
    }

    private func getKeyWindow() -> UIWindow? {
        let windows = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
        return windows.first { $0.isKeyWindow } ?? windows.first
    }

    @objc private func applicationDidBecomeActive(_ notification: NSNotification) {
        unobscureScreen()
    }

    @objc private func applicationWillResignActive(_ notification: NSNotification) {
        if isEnabled {
            obscureScreen()
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }
}
