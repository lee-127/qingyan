import UIKit
import XCTest
@testable import Qingyan

final class QuestionCropTests: XCTestCase {
    @MainActor
    func testPhotoEditorReturnsOnlyConfirmedAreaAndCancelsCleanly() throws {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: CGSize(width: 600, height: 800), format: format).image { context in
            UIColor.white.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 600, height: 800))
        }
        let controller = QuestionCameraController(photo: image)
        var result: Result<Data?, Error>?
        controller.onFinish = { result = $0 }
        controller.loadViewIfNeeded()
        controller.view.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        controller.view.layoutIfNeeded()
        let confirm = try XCTUnwrap(button("使用选区", in: controller.view))
        confirm.sendActions(for: .touchUpInside)
        let data = try XCTUnwrap(try result?.get())
        let cropped = try XCTUnwrap(UIImage(data: data))
        XCTAssertEqual(cropped.size.width, 528, accuracy: 2)
        XCTAssertEqual(cropped.size.height, 640, accuracy: 2)

        let cancelled = QuestionCameraController(photo: image)
        var callbacks = 0
        cancelled.onFinish = { value in
            callbacks += 1
            if case .success(let data) = value { XCTAssertNil(data) }
            else { XCTFail("Cancel should succeed without a selected photo") }
        }
        cancelled.loadViewIfNeeded()
        let cancel = try XCTUnwrap(button("取消", in: cancelled.view))
        cancel.sendActions(for: .touchUpInside)
        cancel.sendActions(for: .touchUpInside)
        XCTAssertEqual(callbacks, 1)
    }

    @MainActor
    private func button(_ title: String, in view: UIView) -> UIButton? {
        if let button = view as? UIButton, button.currentTitle == title { return button }
        return view.subviews.lazy.compactMap { self.button(title, in: $0) }.first
    }

    func testMovingKeepsSizeAndStopsAtEdges() {
        let original = CGRect(x: 0.2, y: 0.3, width: 0.5, height: 0.4)
        let moved = QuestionCropGeometry.moved(original, delta: CGPoint(x: 4, y: -4))
        XCTAssertEqual(moved.size, original.size)
        XCTAssertEqual(moved.minX, 0.5, accuracy: 0.001)
        XCTAssertEqual(moved.minY, 0, accuracy: 0.001)
    }

    func testEveryResizeHandleStaysWithinImageAndCannotCross() {
        let original = CGRect(x: 0.2, y: 0.3, width: 0.5, height: 0.4)
        for handle in QuestionCropGeometry.Handle.allCases {
            for target in [CGPoint(x: -3, y: -3), CGPoint(x: 4, y: 4)] {
                let resized = QuestionCropGeometry.resized(original, handle: handle, to: target,
                                                          minimum: CGSize(width: 0.1, height: 0.1))
                XCTAssertGreaterThanOrEqual(resized.width, 0.099)
                XCTAssertGreaterThanOrEqual(resized.height, 0.099)
                XCTAssertGreaterThanOrEqual(resized.minX, 0)
                XCTAssertGreaterThanOrEqual(resized.minY, 0)
                XCTAssertLessThanOrEqual(resized.maxX, 1.001)
                XCTAssertLessThanOrEqual(resized.maxY, 1.001)
            }
        }
    }

    func testPortraitAndLandscapeAspectFillMapToCapturedPixels() {
        let selection = CGRect(x: 0.2, y: 0.25, width: 0.6, height: 0.5)
        let viewport = CGRect(x: 0, y: 0, width: 300, height: 500)
        let crop = QuestionCropGeometry.pixelRect(selection: selection, viewport: viewport,
                                                 pixels: CGSize(width: 3000, height: 4000), fill: true)
        assertPixels(crop, CGRect(x: 780, y: 1000, width: 1440, height: 2000))
        let horizontal = QuestionCropGeometry.pixelRect(selection: selection, viewport: viewport,
                                                       pixels: CGSize(width: 4000, height: 3000), fill: true)
        assertPixels(horizontal, CGRect(x: 1460, y: 750, width: 1080, height: 1500))
        let album = QuestionCropGeometry.pixelRect(selection: selection, viewport: viewport,
                                                   pixels: CGSize(width: 4000, height: 3000), fill: false)
        assertPixels(album, CGRect(x: 800, y: 750, width: 2400, height: 1500))
    }

    private func assertPixels(_ actual: CGRect, _ expected: CGRect) {
        XCTAssertEqual(actual.minX, expected.minX, accuracy: 1)
        XCTAssertEqual(actual.minY, expected.minY, accuracy: 1)
        XCTAssertEqual(actual.width, expected.width, accuracy: 1)
        XCTAssertEqual(actual.height, expected.height, accuracy: 1)
    }
}
