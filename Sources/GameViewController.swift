import UIKit
import WebKit

/// Full-screen, landscape-only host for PB Ranked.
/// Build 1: plain wrapper + diagnostics export + virtual-controller test.
final class GameViewController: UIViewController, WKUIDelegate, WKNavigationDelegate {

    static let gameURL = URL(string: "https://ranked.pokemonbattlegrounds.com/")!

    private var webView: WKWebView!
    private var popup: PopupContainer?
    private let debugButton = UIButton(type: .system)
    private var vpadOn = false

    // MARK: Full-screen behaviour

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }

    // MARK: Setup

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()          // keeps the login between launches
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.preferences.javaScriptCanOpenWindowsAutomatically = true
        config.applicationNameForUserAgent = "Version/26.0 Mobile/15E148 Safari/604.1"

        for name in ["probe", "vpad", "layout"] {
            if let source = Self.loadScript(name) {
                config.userContentController.addUserScript(
                    WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
            }
        }

        // Lock zoom so drags and taps never turn into pinch/double-tap zooms; page scrolling still works.
        config.userContentController.addUserScript(WKUserScript(source: Self.viewportScript,
                                                                injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        config.userContentController.add(HapticHandler(), name: "pbtHaptic")

        let wv = WKWebView(frame: view.bounds, configuration: config)
        wv.translatesAutoresizingMaskIntoConstraints = false
        wv.uiDelegate = self
        wv.navigationDelegate = self
        wv.isOpaque = false
        wv.backgroundColor = .black
        wv.scrollView.backgroundColor = .black
        wv.scrollView.contentInsetAdjustmentBehavior = .never
        wv.scrollView.bounces = false
        wv.scrollView.pinchGestureRecognizer?.isEnabled = false
        wv.allowsBackForwardNavigationGestures = false
        if #available(iOS 16.4, *) { wv.isInspectable = true }
        view.addSubview(wv)
        NSLayoutConstraint.activate([
            wv.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            wv.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            wv.topAnchor.constraint(equalTo: view.topAnchor),
            wv.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        webView = wv

        setupDebugButton()

        let threeFingerTap = UITapGestureRecognizer(target: self, action: #selector(toggleDebugButton))
        threeFingerTap.numberOfTouchesRequired = 3
        threeFingerTap.cancelsTouchesInView = false
        threeFingerTap.delaysTouchesBegan = false
        threeFingerTap.delaysTouchesEnded = false   // build 1 held back every tap's end, breaking quick taps
        view.addGestureRecognizer(threeFingerTap)

        wv.load(URLRequest(url: Self.gameURL))
    }

    private static let viewportScript = """
    (function () {
      var c = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
      var m = document.querySelector('meta[name="viewport"]');
      if (m) { m.setAttribute('content', c); }
      else { m = document.createElement('meta'); m.name = 'viewport'; m.content = c; (document.head || document.documentElement).appendChild(m); }
    })();
    """

    private static func loadScript(_ name: String) -> String? {
        guard let url = Bundle.main.url(forResource: name, withExtension: "js") else { return nil }
        return try? String(contentsOf: url, encoding: .utf8)
    }

    static var appVersion: String {
        let info = Bundle.main.infoDictionary
        let v = info?["CFBundleShortVersionString"] as? String ?? "?"
        let b = info?["CFBundleVersion"] as? String ?? "?"
        return "\(v) (\(b))"
    }

    // MARK: Debug button + menu

    private func setupDebugButton() {
        debugButton.setTitle("⚙︎", for: .normal)
        debugButton.titleLabel?.font = .systemFont(ofSize: 18, weight: .bold)
        debugButton.setTitleColor(.white, for: .normal)
        debugButton.backgroundColor = UIColor.black.withAlphaComponent(0.45)
        debugButton.layer.cornerRadius = 17
        debugButton.alpha = 0.6
        debugButton.translatesAutoresizingMaskIntoConstraints = false
        debugButton.addTarget(self, action: #selector(showMenu), for: .touchUpInside)
        view.addSubview(debugButton)
        NSLayoutConstraint.activate([
            debugButton.widthAnchor.constraint(equalToConstant: 34),
            debugButton.heightAnchor.constraint(equalToConstant: 34),
            debugButton.topAnchor.constraint(equalTo: view.topAnchor, constant: 8),
            debugButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
        ])
    }

    @objc private func toggleDebugButton() {
        debugButton.isHidden.toggle()
        view.bringSubviewToFront(debugButton)
    }

    @objc private func showMenu() {
        let menu = UIAlertController(title: "PB Touch \(Self.appVersion)", message: nil, preferredStyle: .actionSheet)
        menu.addAction(UIAlertAction(title: "Custom battle controls: on / off", style: .default) { [weak self] _ in
            self?.runLayout("toggle")
        })
        menu.addAction(UIAlertAction(title: "Arena size: full screen → 100% → 92% → 84%", style: .default) { [weak self] _ in
            self?.runLayout("cycleScale")
        })
        menu.addAction(UIAlertAction(title: "Edit layout (move and resize each control)", style: .default) { [weak self] _ in
            self?.runLayout("edit")
        })
        menu.addAction(UIAlertAction(title: "All buttons size: 100% → 115% → 130% → 85%", style: .default) { [weak self] _ in
            self?.runLayout("cycleSize")
        })
        menu.addAction(UIAlertAction(title: "Controls opacity: 85% → 60% → 100%", style: .default) { [weak self] _ in
            self?.runLayout("cycleOpacity")
        })
        menu.addAction(UIAlertAction(title: "Move input: controller / taps", style: .default) { [weak self] _ in
            self?.runLayout("toggleInput")
        })
        menu.addAction(UIAlertAction(title: "Export diagnostics now", style: .default) { [weak self] _ in
            self?.exportDiagnostics()
        })
        menu.addAction(UIAlertAction(title: "Export diagnostics in 5 seconds", style: .default) { [weak self] _ in
            self?.toast("Exporting in 5 s…")
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in self?.exportDiagnostics() }
        })
        menu.addAction(UIAlertAction(title: vpadOn ? "Virtual controller test: turn OFF" : "Virtual controller test: turn ON",
                                     style: .default) { [weak self] _ in
            self?.toggleVpad()
        })
        menu.addAction(UIAlertAction(title: "Reload game", style: .default) { [weak self] _ in
            self?.webView.reload()
        })
        menu.addAction(UIAlertAction(title: "Hide this button (3-finger tap brings it back)", style: .default) { [weak self] _ in
            self?.debugButton.isHidden = true
        })
        menu.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        if let pop = menu.popoverPresentationController {
            pop.sourceView = debugButton
            pop.sourceRect = debugButton.bounds
        }
        presentOnTop(menu)
    }

    private func runLayout(_ fn: String) {
        webView.evaluateJavaScript("window.__pbt && window.__pbt.layout ? window.__pbt.layout.\(fn)() : 'Controls not loaded yet'") { [weak self] result, _ in
            if let text = result as? String { self?.toast(text) }
        }
    }

    private func toggleVpad() {
        vpadOn.toggle()
        applyVpad()
        toast(vpadOn ? "Virtual controller ON — press A to wake it in game" : "Virtual controller OFF")
    }

    private func applyVpad() {
        webView.evaluateJavaScript("window.__pbt && window.__pbt.vpad && window.__pbt.vpad.test(\(vpadOn ? "true" : "false"))",
                                   completionHandler: nil)
    }

    private func presentOnTop(_ vc: UIViewController) {
        var top: UIViewController = self
        while let next = top.presentedViewController { top = next }
        top.present(vc, animated: true)
    }

    private func toast(_ text: String) {
        let label = UILabel()
        label.text = "   \(text)   "
        label.textColor = .white
        label.backgroundColor = UIColor.black.withAlphaComponent(0.75)
        label.font = .systemFont(ofSize: 14, weight: .semibold)
        label.layer.cornerRadius = 8
        label.clipsToBounds = true
        label.sizeToFit()
        label.frame.size.height += 12
        label.center = CGPoint(x: view.bounds.midX, y: 64)
        view.addSubview(label)
        UIView.animate(withDuration: 0.3, delay: 2.2, options: [], animations: { label.alpha = 0 },
                       completion: { _ in label.removeFromSuperview() })
    }

    // MARK: Diagnostics export

    private func exportDiagnostics() {
        toast("Collecting…")
        webView.callAsyncJavaScript("return await window.__pbt.collect();", arguments: [:], in: nil, in: .page) { [weak self] r1 in
            let diag: String
            switch r1 {
            case .success(let value): diag = (value as? String) ?? Self.jsonString(["error": "collect() returned no string"])
            case .failure(let error): diag = Self.jsonString(["error": error.localizedDescription])
            }
            self?.webView.callAsyncJavaScript("return window.__pbt.html();", arguments: [:], in: nil, in: .page) { [weak self] r2 in
                var html = ""
                if case .success(let value) = r2, let s = value as? String { html = s }
                self?.webView.takeSnapshot(with: nil) { [weak self] image, _ in
                    self?.writeExport(diag: diag, html: html, image: image)
                }
            }
        }
    }

    private func writeExport(diag: String, html: String, image: UIImage?) {
        let fm = FileManager.default
        let docs = fm.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let stamp = Self.stamp()
        let exportsDir = docs.appendingPathComponent("exports", isDirectory: true)
        let dir = exportsDir.appendingPathComponent("pbtouch-\(stamp)", isDirectory: true)
        do {
            try fm.createDirectory(at: dir, withIntermediateDirectories: true)
            var files: [URL] = []
            let d = dir.appendingPathComponent("diagnostics.json")
            try diag.write(to: d, atomically: true, encoding: .utf8); files.append(d)
            let n = dir.appendingPathComponent("native.json")
            try nativeInfo().write(to: n, atomically: true, encoding: .utf8); files.append(n)
            if !html.isEmpty {
                let h = dir.appendingPathComponent("page.html")
                try html.write(to: h, atomically: true, encoding: .utf8); files.append(h)
            }
            if let png = image?.pngData() {
                let p = dir.appendingPathComponent("screenshot.png")
                try png.write(to: p); files.append(p)
            }
            let items: [URL] = zipFolder(dir).map { [$0] } ?? files
            let share = UIActivityViewController(activityItems: items, applicationActivities: nil)
            if let pop = share.popoverPresentationController {
                pop.sourceView = debugButton
                pop.sourceRect = debugButton.bounds
            }
            presentOnTop(share)
        } catch {
            toast("Export failed: \(error.localizedDescription)")
        }
    }

    /// Uses the system's built-in "zip for upload" coordination to make one file to share.
    private func zipFolder(_ dir: URL) -> URL? {
        var result: URL?
        var coordError: NSError?
        NSFileCoordinator().coordinate(readingItemAt: dir, options: [.forUploading], error: &coordError) { tmp in
            let dest = dir.deletingLastPathComponent().appendingPathComponent(dir.lastPathComponent + ".zip")
            try? FileManager.default.removeItem(at: dest)
            if (try? FileManager.default.copyItem(at: tmp, to: dest)) != nil { result = dest }
        }
        return result
    }

    private func nativeInfo() -> String {
        let screen = UIScreen.main
        let insets = view.safeAreaInsets
        var sys = utsname()
        uname(&sys)
        let model = withUnsafePointer(to: &sys.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 1) { String(cString: $0) }
        }
        let info: [String: Any] = [
            "app": Self.appVersion,
            "model": model,
            "ios": UIDevice.current.systemVersion,
            "screenPoints": [screen.bounds.width, screen.bounds.height],
            "scale": screen.scale,
            "safeArea": ["top": insets.top, "left": insets.left, "bottom": insets.bottom, "right": insets.right],
            "webViewSize": [webView.frame.width, webView.frame.height],
            "url": webView.url?.absoluteString ?? "",
            "virtualControllerOn": vpadOn,
        ]
        return Self.jsonString(info)
    }

    static func jsonString(_ object: Any) -> String {
        guard JSONSerialization.isValidJSONObject(object),
              let data = try? JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys]),
              let s = String(data: data, encoding: .utf8) else { return "{}" }
        return s
    }

    private static func stamp() -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_GB_POSIX")
        f.dateFormat = "yyyyMMdd-HHmmss"
        return f.string(from: Date())
    }

    // MARK: WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if webView === self.webView && vpadOn { applyVpad() }
    }

    // MARK: WKUIDelegate — popups (Discord sign-in) and JS dialogs

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        let host = navigationAction.request.url?.host?.lowercased() ?? ""
        let inApp = host.isEmpty || Self.inAppHosts.contains { host == $0 || host.hasSuffix("." + $0) }
        if !inApp, let url = navigationAction.request.url {
            UIApplication.shared.open(url)      // links to other sites open in Safari
            return nil
        }
        closePopup()
        let child = WKWebView(frame: view.bounds, configuration: configuration)
        child.uiDelegate = self
        let container = PopupContainer(webView: child) { [weak self] in self?.closePopup() }
        container.frame = view.bounds
        container.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(container)
        view.bringSubviewToFront(debugButton)
        popup = container
        return child
    }

    private static let inAppHosts = ["pokemonbattlegrounds.com", "discord.com", "discordapp.com",
                                     "accounts.google.com", "google.com", "gstatic.com"]

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = navigationAction.request.url, let scheme = url.scheme?.lowercased() else { return .allow }
        if ["http", "https", "about", "blob", "data", "javascript", "file"].contains(scheme) { return .allow }
        _ = await UIApplication.shared.open(url)   // discord://, mailto: and the like
        return .cancel
    }

    func webViewDidClose(_ webView: WKWebView) {
        if webView !== self.webView { closePopup() }
    }

    private func closePopup() {
        popup?.removeFromSuperview()
        popup = nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo) async {
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            a.addAction(UIAlertAction(title: "OK", style: .default) { _ in cont.resume() })
            presentOnTop(a)
        }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo) async -> Bool {
        await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
            let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            a.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in cont.resume(returning: false) })
            a.addAction(UIAlertAction(title: "OK", style: .default) { _ in cont.resume(returning: true) })
            presentOnTop(a)
        }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo) async -> String? {
        await withCheckedContinuation { (cont: CheckedContinuation<String?, Never>) in
            let a = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
            a.addTextField { $0.text = defaultText }
            a.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in cont.resume(returning: nil) })
            a.addAction(UIAlertAction(title: "OK", style: .default) { [weak a] _ in
                cont.resume(returning: a?.textFields?.first?.text ?? "")
            })
            presentOnTop(a)
        }
    }
}

/// Sheet that hosts a popup window (e.g. Discord OAuth) with a close bar.
final class PopupContainer: UIView {
    private let onClose: () -> Void

    init(webView: WKWebView, onClose: @escaping () -> Void) {
        self.onClose = onClose
        super.init(frame: .zero)
        backgroundColor = UIColor.black.withAlphaComponent(0.85)

        let bar = UIView()
        bar.backgroundColor = UIColor(white: 0.12, alpha: 1)
        bar.translatesAutoresizingMaskIntoConstraints = false
        addSubview(bar)

        let close = UIButton(type: .system)
        close.setTitle("Close", for: .normal)
        close.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
        close.translatesAutoresizingMaskIntoConstraints = false
        close.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
        bar.addSubview(close)

        let title = UILabel()
        title.text = "Sign in"
        title.textColor = .white
        title.font = .systemFont(ofSize: 15, weight: .semibold)
        title.translatesAutoresizingMaskIntoConstraints = false
        bar.addSubview(title)

        webView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(webView)

        let guide = safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            bar.topAnchor.constraint(equalTo: guide.topAnchor),
            bar.leadingAnchor.constraint(equalTo: guide.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: guide.trailingAnchor),
            bar.heightAnchor.constraint(equalToConstant: 44),
            close.leadingAnchor.constraint(equalTo: bar.leadingAnchor, constant: 16),
            close.centerYAnchor.constraint(equalTo: bar.centerYAnchor),
            title.centerXAnchor.constraint(equalTo: bar.centerXAnchor),
            title.centerYAnchor.constraint(equalTo: bar.centerYAnchor),
            webView.topAnchor.constraint(equalTo: bar.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: guide.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: guide.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    @objc private func closeTapped() { onClose() }
}

/// Haptic taps for the custom controls (window.webkit.messageHandlers.pbtHaptic).
@MainActor
final class HapticHandler: NSObject, WKScriptMessageHandler {
    private let light = UIImpactFeedbackGenerator(style: .light)
    private let medium = UIImpactFeedbackGenerator(style: .medium)
    private let rigid = UIImpactFeedbackGenerator(style: .rigid)
    private let selection = UISelectionFeedbackGenerator()

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        switch message.body as? String ?? "light" {
        case "selection": selection.selectionChanged()
        case "medium": medium.impactOccurred()
        case "rigid": rigid.impactOccurred(intensity: 0.6)
        default: light.impactOccurred()
        }
    }
}
