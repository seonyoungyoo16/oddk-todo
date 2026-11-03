import UIKit
import WebKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = OddkBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

// Cover the actual scene-created WKWebView, not just the launch storyboard.
class OddkBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        lockWebZoom()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        lockWebZoom()
    }

    private func lockWebZoom() {
        guard let scroll = webView?.scrollView else { return }
        scroll.pinchGestureRecognizer?.isEnabled = false
        scroll.minimumZoomScale = 1
        scroll.maximumZoomScale = 1
        if abs(scroll.zoomScale - 1) > 0.001 { scroll.setZoomScale(1, animated: false) }
    }
}
