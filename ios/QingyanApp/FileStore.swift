import Foundation

struct StudyError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

final class FileStore {
    static let maximumPackage = 64 * 1024 * 1024
    private let fm = FileManager.default
    private let localQueue = DispatchQueue(label: "qingyan.local-files")
    private let cloudQueue = DispatchQueue(label: "qingyan.cloud-files", qos: .utility)
    private let defaults: UserDefaults
    private let bookmarkKey = "qingyan.cloud-folder-bookmark"
    let directory: URL
    let files: URL
    let deviceID: String

    init(directory: URL? = nil, defaults: UserDefaults = .standard) throws {
        let manager = FileManager.default
        let base: URL
        if let directory = directory { base = directory }
        else { base = try manager.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("QingyanMobile", isDirectory: true) }
        let assetDirectory = base.appendingPathComponent("files", isDirectory: true)
        try manager.createDirectory(at: assetDirectory, withIntermediateDirectories: true)
        let idURL = base.appendingPathComponent("device-id.txt")
        let identifier: String
        if let existing = try? String(contentsOf: idURL, encoding: .utf8), UUID(uuidString: existing) != nil { identifier = existing }
        else {
            identifier = UUID().uuidString.lowercased()
            try identifier.write(to: idURL, atomically: true, encoding: .utf8)
        }
        self.defaults = defaults
        self.directory = base
        files = assetDirectory
        deviceID = identifier
        var excluded = self.directory
        var values = URLResourceValues()
        // Keep this cache eligible for the user's normal device backup as an extra recovery path.
        values.isExcludedFromBackup = false
        try? excluded.setResourceValues(values)
    }

    func local<T>(_ operation: @escaping () throws -> T) async throws -> T {
        try await withCheckedThrowingContinuation { continuation in
            localQueue.async {
                do { continuation.resume(returning: try operation()) }
                catch { continuation.resume(throwing: error) }
            }
        }
    }
    func cloud<T>(_ operation: @escaping () throws -> T) async throws -> T {
        try await withCheckedThrowingContinuation { continuation in
            cloudQueue.async {
                do { continuation.resume(returning: try operation()) }
                catch { continuation.resume(throwing: error) }
            }
        }
    }
    func safeAsset(_ id: String) throws -> URL {
        guard UUID(uuidString: id) != nil else { throw StudyError("附件编号无效") }
        return files.appendingPathComponent(id)
    }
    func safeName(_ value: String) -> String {
        let illegal = CharacterSet(charactersIn: "/\\:*?\"<>|").union(.controlCharacters)
        let result = value.unicodeScalars.map { illegal.contains($0) ? "_" : String($0) }.joined()
        return String((result.isEmpty ? "清研文件" : result).prefix(200))
    }
    func decode(_ base64: String, limit: Int) throws -> Data {
        guard base64.utf8.count <= ((limit + 2) / 3) * 4 + 4,
              let data = Data(base64Encoded: base64), data.count <= limit else {
            throw StudyError("文件过大或内容无效")
        }
        return data
    }
    private func stateURL(_ suffix: String = "") -> URL { directory.appendingPathComponent("state.json" + suffix) }
    func readState() throws -> Any {
        var found = false
        for suffix in ["", ".previous"] {
            let url = stateURL(suffix)
            guard fm.fileExists(atPath: url.path) else { continue }
            found = true
            if let data = try? Data(contentsOf: url), let state = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               state["schemaVersion"] as? Int == 2, state["data"] is [String: Any], state["assets"] is [Any], state["tombstones"] is [Any] {
                return state
            }
        }
        if found { throw StudyError("缓存无法读取，原文件仍保留。请从完整备份或 iCloud 同步包恢复。") }
        return NSNull()
    }
    func persist(_ state: [String: Any]) throws {
        guard state["schemaVersion"] as? Int == 2, state["data"] is [String: Any], state["assets"] is [Any], state["tombstones"] is [Any] else {
            throw StudyError("缓存格式无效")
        }
        let data = try JSONSerialization.data(withJSONObject: state)
        if fm.fileExists(atPath: stateURL().path) {
            try Data(contentsOf: stateURL()).write(to: stateURL(".previous"), options: .atomic)
        }
        try data.write(to: stateURL(), options: .atomic)
    }
    func readAsset(_ id: String) throws -> String {
        try Data(contentsOf: safeAsset(id)).base64EncodedString()
    }
    func writeAsset(_ id: String, base64: String) throws {
        let destination = try safeAsset(id)
        let bytes = try decode(base64, limit: 20 * 1024 * 1024)
        if !fm.fileExists(atPath: destination.path) { try bytes.write(to: destination, options: .atomic) }
    }
    func boot() throws -> [String: Any] {
        ["state": try readState(), "deviceId": deviceID, "folder": connectedName() as Any]
    }
    func connectedName() -> Any {
        guard let bookmark = defaults.data(forKey: bookmarkKey) else { return NSNull() }
        var stale = false
        guard let url = try? URL(resolvingBookmarkData: bookmark, options: .withoutUI, relativeTo: nil, bookmarkDataIsStale: &stale), !stale else { return NSNull() }
        return url.lastPathComponent
    }
    func connect(_ url: URL) throws -> String {
        guard url.startAccessingSecurityScopedResource() else { throw StudyError("没有取得文件夹权限，请重新选择") }
        defer { url.stopAccessingSecurityScopedResource() }
        let sync = url.appendingPathComponent("同步数据", isDirectory: true)
        var isDirectory: ObjCBool = false
        guard fm.fileExists(atPath: sync.path, isDirectory: &isDirectory), isDirectory.boolValue else {
            throw StudyError("请选择已有的“清研复习”文件夹，其中应有“同步数据”子文件夹")
        }
        let bookmark = try url.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil)
        defaults.set(bookmark, forKey: bookmarkKey)
        return url.lastPathComponent
    }
    private func withFolder<T>(_ operation: (URL) throws -> T) throws -> T {
        guard let bookmark = defaults.data(forKey: bookmarkKey) else { throw StudyError("请先连接 iCloud 云盘中的“清研复习”文件夹") }
        var stale = false
        let url = try URL(resolvingBookmarkData: bookmark, options: .withoutUI, relativeTo: nil, bookmarkDataIsStale: &stale)
        guard url.startAccessingSecurityScopedResource() else { throw StudyError("云盘授权已失效，请重新选择文件夹") }
        defer { url.stopAccessingSecurityScopedResource() }
        if stale {
            defaults.set(try url.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil), forKey: bookmarkKey)
        }
        return try operation(url)
    }
    private func coordinated<T>(_ url: URL, writing: Bool = false, _ operation: @escaping (URL) throws -> T) throws -> T {
        var coordinationError: NSError?
        var result: Result<T, Error>?
        let access: (URL) -> Void = { target in result = Result { try operation(target) } }
        let coordinator = NSFileCoordinator()
        if writing { coordinator.coordinate(writingItemAt: url, options: [], error: &coordinationError, byAccessor: access) }
        else { coordinator.coordinate(readingItemAt: url, options: [], error: &coordinationError, byAccessor: access) }
        if let error = coordinationError { throw error }
        guard let result = result else { throw StudyError("文件协调未完成，请稍后重试") }
        return try result.get()
    }
    func listPackages() throws -> [String] {
        try withFolder { root in
            let directory = root.appendingPathComponent("同步数据", isDirectory: true)
            return try coordinated(directory) { folder in
                try self.fm.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil).map(\.lastPathComponent)
                    .filter { self.validPackage($0) && $0 != "device-\(self.deviceID).zip" }.sorted()
            }
        }
    }
    private func validPackage(_ name: String) -> Bool {
        guard name.hasPrefix("device-"), name.hasSuffix(".zip") else { return false }
        return UUID(uuidString: String(name.dropFirst(7).dropLast(4))) != nil
    }
    func readPackage(_ name: String) throws -> String {
        guard validPackage(name) else { throw StudyError("同步包名称无效") }
        return try withFolder { root in
            let url = root.appendingPathComponent("同步数据").appendingPathComponent(name)
            if fm.isUbiquitousItem(at: url) { try? fm.startDownloadingUbiquitousItem(at: url) }
            return try coordinated(url) { file in
                let size = try file.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                guard size <= Self.maximumPackage else { throw StudyError("同步包超过首版 64 MB 限制，请在电脑版管理较大资料库") }
                let bytes = try Data(contentsOf: file)
                guard bytes.count <= Self.maximumPackage else { throw StudyError("同步包过大") }
                return bytes.base64EncodedString()
            }
        }
    }
    func publish(base64: String, attachments: [[String: Any]]) throws -> [String: Any] {
        let bytes = try decode(base64, limit: Self.maximumPackage)
        try bytes.write(to: directory.appendingPathComponent("pending-sync.zip"), options: .atomic)
        return try withFolder { root in
            let sync = root.appendingPathComponent("同步数据", isDirectory: true)
            for asset in attachments {
                guard let id = asset["id"] as? String, let name = asset["name"] as? String else { throw StudyError("附件信息不完整") }
                let source = try safeAsset(id)
                let parent = root.appendingPathComponent("资料附件").appendingPathComponent(id, isDirectory: true)
                let target = parent.appendingPathComponent(safeName(name))
                try coordinated(parent, writing: true) { folder in
                    try self.fm.createDirectory(at: folder, withIntermediateDirectories: true)
                }
                if !fm.fileExists(atPath: target.path) {
                    try coordinated(target, writing: true) { url in
                        if !self.fm.fileExists(atPath: url.path) { try self.fm.copyItem(at: source, to: url) }
                    }
                }
            }
            let destination = sync.appendingPathComponent("device-\(deviceID).zip")
            try coordinated(destination, writing: true) { target in
                try self.fm.createDirectory(at: sync, withIntermediateDirectories: true)
                if self.fm.fileExists(atPath: target.path) {
                    try Data(contentsOf: target).write(to: target.appendingPathExtension("previous"), options: .atomic)
                }
                try bytes.write(to: target, options: .atomic)
            }
            return ["writtenAt": ISO8601DateFormatter().string(from: Date()), "uploadVerified": false]
        }
    }
    func previewFile(id: String, name: String) throws -> URL {
        let source = try safeAsset(id)
        let folder = fm.temporaryDirectory.appendingPathComponent("qingyan-\(id)", isDirectory: true)
        try fm.createDirectory(at: folder, withIntermediateDirectories: true)
        let target = folder.appendingPathComponent(safeName(name))
        try Data(contentsOf: source).write(to: target, options: .atomic)
        return target
    }
    func exportFile(name: String, base64: String) throws -> URL {
        let folder = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try fm.createDirectory(at: folder, withIntermediateDirectories: true)
        let target = folder.appendingPathComponent(safeName(name))
        try decode(base64, limit: Self.maximumPackage).write(to: target, options: .atomic)
        return target
    }
}
