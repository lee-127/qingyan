import XCTest
import UIKit

final class LaunchTests: XCTestCase {
    @MainActor
    func testVariantPracticeHasIndependentScreen() {
        let app = XCUIApplication()
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.staticTexts["我的复习空间"].firstMatch.waitForExistence(timeout: 20))
        let menu = web.buttons["打开导航"].firstMatch
        if menu.isHittable { menu.tap() }
        web.buttons["AI 变式练习"].firstMatch.tap()
        XCTAssertTrue(web.staticTexts["选择原错题"].firstMatch.waitForExistence(timeout: 10))
        XCTAssertTrue(web.staticTexts["先在错题本录入一道题，再到这里生成变式练习。"].firstMatch.exists)
    }

    @MainActor
    func testPhotoSearchOpensFromNavigationAndRequiresAnImage() {
        let app = XCUIApplication()
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.staticTexts["我的复习空间"].firstMatch.waitForExistence(timeout: 20))
        let menu = web.buttons["打开导航"].firstMatch
        if menu.isHittable { menu.tap() }
        web.buttons["AI 拍照搜题"].firstMatch.tap()

        let album = web.buttons["从相册选择"].firstMatch
        XCTAssertTrue(album.waitForExistence(timeout: 10))
        let search = web.buttons["开始搜题"].firstMatch
        XCTAssertTrue(search.exists)
        XCTAssertFalse(search.isEnabled)

        let camera = web.buttons["拍照"].firstMatch
        XCTAssertTrue(camera.exists)
        #if targetEnvironment(simulator)
        camera.tap()
        XCTAssertTrue(web.staticTexts["当前设备无法使用相机，请从相册选择题图"].firstMatch.waitForExistence(timeout: 5))
        XCTAssertTrue(album.isEnabled)
        #endif
        web.buttons["DeepSeek 设置"].firstMatch.tap()
        XCTAssertTrue(web.staticTexts["DeepSeek 解题"].firstMatch.waitForExistence(timeout: 10))
    }

    @MainActor
    func testOpenAndCancelScanWorkspace() {
        let app = XCUIApplication()
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.staticTexts["我的复习空间"].firstMatch.waitForExistence(timeout: 20))
        let menu = web.buttons["打开导航"].firstMatch
        if menu.isHittable { menu.tap() }
        web.buttons["资料库"].firstMatch.tap()
        web.buttons["上传 / 扫描资料"].firstMatch.tap()
        let scan = web.buttons["智能扫描 PDF"].firstMatch
        XCTAssertTrue(scan.waitForExistence(timeout: 10))
        scan.tap()
        XCTAssertTrue(app.buttons["相机扫描"].firstMatch.waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["从相册导入"].firstMatch.exists)
        XCTAssertFalse(app.buttons["生成 PDF"].firstMatch.isEnabled)
        app.buttons["关闭"].firstMatch.tap()
        XCTAssertTrue(scan.waitForExistence(timeout: 10))
        XCTAssertTrue(scan.isEnabled)
    }

    func testBundledWorkspaceLoadsWithoutServer() {
        let app = XCUIApplication()
        app.launch()
        let page = app.webViews.firstMatch
        XCTAssertTrue(page.waitForExistence(timeout: 15))
        XCTAssertTrue(page.staticTexts["我的复习空间"].firstMatch.waitForExistence(timeout: 20))
        XCTAssertFalse(page.staticTexts["App 内缺少界面文件，需要重新编译安装包。"].exists)
    }

    @MainActor
    func testPhoneBackgroundCoversSystemInsets() throws {
        guard UIDevice.current.userInterfaceIdiom == .phone else {
            throw XCTSkip("The edge background is specific to iPhone.")
        }
        let app = XCUIApplication()
        app.launch()
        let page = app.webViews.firstMatch
        XCTAssertTrue(page.staticTexts["我的复习空间"].firstMatch.waitForExistence(timeout: 20))

        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = "iPhone safe-area background"
        attachment.lifetime = .keepAlways
        add(attachment)
        let image = try XCTUnwrap(screenshot.image.cgImage)
        for (edge, fraction) in [("status bar", 0.02), ("home indicator", 0.988)] {
            let point = CGRect(x: Int(Double(image.width) * 0.15),
                               y: Int(Double(image.height) * fraction), width: 1, height: 1)
            let sample = try XCTUnwrap(image.cropping(to: point))
            var pixel = [UInt8](repeating: 0, count: 4)
            try pixel.withUnsafeMutableBytes { bytes in
                let context = try XCTUnwrap(CGContext(
                    data: bytes.baseAddress, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
                ))
                context.draw(sample, in: CGRect(x: 0, y: 0, width: 1, height: 1))
            }
            XCTAssertTrue(pixel.prefix(3).allSatisfy { $0 > 160 }, "Expected a light background behind the \(edge).")
        }
    }
}
