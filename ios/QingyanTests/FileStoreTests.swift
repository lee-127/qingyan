import XCTest
@testable import Qingyan

final class FileStoreTests: XCTestCase {
    private var folder: URL!
    override func setUpWithError() throws {
        folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    }
    override func tearDownWithError() throws { try? FileManager.default.removeItem(at: folder) }
    private var state: [String: Any] {
        let records: [String: [[String: Any]]] = ["material": [], "mistake": [], "paper": [], "score": [], "settings": []]
        return ["schemaVersion": 2, "data": records, "assets": [[String: Any]](), "tombstones": [[String: Any]](), "hashes": [String: String]()]
    }
    func testDurableStateAndDeviceIdentity() throws {
        let first = try FileStore(directory: folder)
        try first.persist(state)
        let second = try FileStore(directory: folder)
        XCTAssertEqual(first.deviceID, second.deviceID)
        XCTAssertEqual((try second.readState() as? [String: Any])?["schemaVersion"] as? Int, 2)
    }
    func testInvalidCacheFallsBackToPreviousState() throws {
        let store = try FileStore(directory: folder)
        try store.persist(state)
        try store.persist(state)
        try Data("corrupt".utf8).write(to: folder.appendingPathComponent("state.json"))
        XCTAssertNotNil(try store.readState() as? [String: Any])
    }
    func testImmutableAssetsAndTraversalGuard() throws {
        let store = try FileStore(directory: folder)
        let id = UUID().uuidString.lowercased(), content = Data("复习笔记".utf8)
        try store.writeAsset(id, base64: content.base64EncodedString())
        XCTAssertEqual(try store.readAsset(id), content.base64EncodedString())
        XCTAssertThrowsError(try store.safeAsset("../../escape"))
        XCTAssertThrowsError(try store.decode("invalid", limit: 100))
    }
}
