import UIKit
import WebKit
import QuickLook
import SwiftUI
import UniformTypeIdentifiers

private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    weak var owner: AppHost?
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        owner?.userContentController(userContentController, didReceive: message)
    }
}

final class AppHost: UIViewController, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate, UIDocumentPickerDelegate, QLPreviewControllerDataSource {
    private var web: WKWebView!
    private var files: FileStore!
    private var webDirectory: URL!
    private var pickerRequest: (id: Int, connecting: Bool)?
    private var previewURL: URL?
    private let deepSeek = DeepSeekService()
    private let questionPhotoPicker = QuestionPhotoPicker()
    private let errorLabel = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.96, green: 0.97, blue: 0.94, alpha: 1)
        do { files = try FileStore() }
        catch { showError(error.localizedDescription); return }
        guard let folder = Bundle.main.url(forResource: "Web", withExtension: nil),
              FileManager.default.fileExists(atPath: folder.appendingPathComponent("index.html").path) else {
            showError("App 内缺少界面文件，需要重新编译安装包。"); return
        }
        webDirectory = folder.standardizedFileURL
        let controller = WKUserContentController()
        let handler = WeakMessageHandler()
        handler.owner = self
        controller.add(handler, name: "qingyanNative")
        controller.addUserScript(WKUserScript(source: "window.__qyNativeApp = true;", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let configuration = WKWebViewConfiguration()
        configuration.userContentController = controller
        configuration.websiteDataStore = .nonPersistent()
        configuration.allowsInlineMediaPlayback = true
        web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.isOpaque = false
        web.backgroundColor = view.backgroundColor
        web.scrollView.backgroundColor = view.backgroundColor
        web.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(web)
        NSLayoutConstraint.activate([
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            web.topAnchor.constraint(equalTo: view.topAnchor),
            web.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        web.loadFileURL(folder.appendingPathComponent("index.html"), allowingReadAccessTo: folder)
    }
    private func showError(_ message: String) {
        errorLabel.numberOfLines = 0
        errorLabel.text = "清研暂时没能打开\n\n\(message)\n\n原有数据仍保存在设备上。"
        errorLabel.textColor = .label
        errorLabel.font = .preferredFont(forTextStyle: .body)
        errorLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(errorLabel)
        NSLayoutConstraint.activate([
            errorLabel.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24),
            errorLabel.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24),
            errorLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 32),
        ])
    }
    private func bundled(_ url: URL?) -> Bool {
        guard let url = url, url.isFileURL, let root = webDirectory else { return false }
        return url.standardizedFileURL.path.hasPrefix(root.path + "/")
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        // This App never navigates to an external website. Hash navigation stays in the bundle.
        decisionHandler(bundled(navigationAction.request.url) ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { showError(error.localizedDescription) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { showError(error.localizedDescription) }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { showError("界面进程已退出，请关闭 App 后重新打开。") }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: "清研", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "知道了", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "qingyanNative", message.frameInfo.isMainFrame, bundled(message.frameInfo.request.url),
              let body = message.body as? [String: Any], let id = body["id"] as? Int,
              let method = body["method"] as? String else { return }
        let parameters = body["params"] as? [String: Any] ?? [:]
        Task { @MainActor in
            do {
                if method == "connect" { try chooseFolder(id); return }
                if method == "pickQuestionPhoto" {
                    try availableForPicker()
                    guard let source = QuestionPhotoPicker.Source(rawValue: try string(parameters, "source")) else {
                        throw StudyError("请选择相机或相册")
                    }
                    try questionPhotoPicker.present(source, from: self) { [weak self] result in
                        switch result {
                        case .success(let photo):
                            let value = photo.map { ["base64": $0.base64EncodedString()] }
                            self?.reply(id, value: value as Any? ?? NSNull())
                        case .failure(let error):
                            self?.reply(id, error: error.localizedDescription)
                        }
                    }
                    return
                }
                if method == "scanPDF" {
                    try availableForPicker()
                    let workspace = ScanWorkspace { [weak self] data in
                        self?.dismiss(animated: true) {
                            let value = data.map { ["base64": $0.base64EncodedString()] }
                            self?.reply(id, value: value as Any? ?? NSNull())
                        }
                    }
                    let controller = UIHostingController(rootView: workspace)
                    controller.modalPresentationStyle = .fullScreen
                    present(controller, animated: true)
                    return
                }
                if method == "openAsset" {
                    let assetID = try string(parameters, "id"), name = try string(parameters, "name")
                    let url = try await files.local { try self.files.previewFile(id: assetID, name: name) }
                    try preview(url, id: id); return
                }
                if method == "exportFile" {
                    let name = try string(parameters, "name"), base64 = try string(parameters, "base64")
                    let url = try await files.local { try self.files.exportFile(name: name, base64: base64) }
                    try export(url, id: id); return
                }
                let value = try await dispatch(method, parameters)
                reply(id, value: value)
            } catch { reply(id, error: error.localizedDescription) }
        }
    }
    private func string(_ parameters: [String: Any], _ key: String) throws -> String {
        guard let value = parameters[key] as? String else { throw StudyError("操作缺少字段：\(key)") }
        return value
    }
    private func dispatch(_ method: String, _ parameters: [String: Any]) async throws -> Any {
        switch method {
        case "aiStatus": return try deepSeek.configured()
        case "aiKey":
            try deepSeek.setKey(try string(parameters, "key"))
            return true
        case "aiSolve":
            return try await deepSeek.solve(question: try string(parameters, "question"), image: parameters["image"] as? String,
                                            previous: parameters["previous"] as? String)
        case "aiVariant":
            return try await deepSeek.solve(question: try string(parameters, "question"), image: parameters["image"] as? String,
                                            variant: true)
        case "renderPDFPage":
            let id = try string(parameters, "id")
            guard let page = parameters["page"] as? Int else { throw StudyError("请输入有效页码") }
            return try await files.local { try ExercisePDF.render(self.files.safeAsset(id), page: page) }
        case "boot": return try await files.local { try self.files.boot() }
        case "uuid": return UUID().uuidString.lowercased()
        case "persist":
            guard let state = parameters["state"] as? [String: Any] else { throw StudyError("缓存格式无效") }
            try await files.local { try self.files.persist(state) }; return true
        case "readAsset":
            let id = try string(parameters, "id")
            return try await files.local { try self.files.readAsset(id) }
        case "writeAsset":
            let id = try string(parameters, "id"), base64 = try string(parameters, "base64")
            try await files.local { try self.files.writeAsset(id, base64: base64) }; return true
        case "listPackages": return try await files.cloud { try self.files.listPackages() }
        case "readPackage":
            let name = try string(parameters, "name")
            return try await files.cloud { try self.files.readPackage(name) }
        case "publish":
            let bytes = try string(parameters, "base64")
            let attachments = parameters["attachments"] as? [[String: Any]] ?? []
            return try await files.cloud { try self.files.publish(base64: bytes, attachments: attachments) }
        default: throw StudyError("App 不支持此操作")
        }
    }
    private func reply(_ id: Int, value: Any = NSNull(), error: String? = nil) {
        var response: [String: Any] = ["id": id]
        if let error = error { response["error"] = error } else { response["value"] = value }
        guard let bytes = try? JSONSerialization.data(withJSONObject: response), let json = String(data: bytes, encoding: .utf8) else { return }
        web?.evaluateJavaScript("window.__qyReply && window.__qyReply(\(json)); 'ok';", completionHandler: nil)
    }
    private func availableForPicker() throws {
        guard presentedViewController == nil, pickerRequest == nil else { throw StudyError("请先完成当前文件窗口的操作") }
    }
    private func chooseFolder(_ id: Int) throws {
        try availableForPicker()
        pickerRequest = (id, true)
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder], asCopy: false)
        picker.delegate = self
        picker.allowsMultipleSelection = false
        present(picker, animated: true)
    }
    private func export(_ url: URL, id: Int) throws {
        try availableForPicker()
        pickerRequest = (id, false)
        let picker = UIDocumentPickerViewController(forExporting: [url], asCopy: true)
        picker.delegate = self
        present(picker, animated: true)
    }
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        if let request = pickerRequest { reply(request.id, error: "已取消文件选择，现有数据仍保留") }
        pickerRequest = nil
    }
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let request = pickerRequest else { return }
        pickerRequest = nil
        guard let url = urls.first else { reply(request.id, error: "没有选择文件夹或保存位置"); return }
        if !request.connecting { reply(request.id, value: true); return }
        // Start the security scope while the picker still owns the returned URL.
        guard url.startAccessingSecurityScopedResource() else { reply(request.id, error: "无法访问所选文件夹"); return }
        Task { @MainActor in
            defer { url.stopAccessingSecurityScopedResource() }
            do {
                let name = try await files.cloud { try self.files.connect(url) }
                reply(request.id, value: ["folder": name])
            } catch { reply(request.id, error: error.localizedDescription) }
        }
    }
    private func preview(_ url: URL, id: Int) throws {
        try availableForPicker()
        previewURL = url
        let controller = QLPreviewController()
        controller.dataSource = self
        present(controller, animated: true) { self.reply(id, value: true) }
    }
    func numberOfPreviewItems(in controller: QLPreviewController) -> Int { previewURL == nil ? 0 : 1 }
    func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem { previewURL! as NSURL }
}
