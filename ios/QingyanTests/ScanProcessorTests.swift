import PDFKit
import UIKit
import XCTest
@testable import Qingyan

final class ScanProcessorTests: XCTestCase {
    func testShadowRemovalBrightensPaperWithoutErasingInk() throws {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let size = CGSize(width: 480, height: 320)
        let image = UIGraphicsImageRenderer(size: size, format: format).image { renderer in
            UIColor.white.setFill()
            renderer.fill(CGRect(origin: .zero, size: size))
            UIColor(white: 0.53, alpha: 1).setFill()
            renderer.fill(CGRect(x: 0, y: 0, width: 240, height: 320))
            UIColor(white: 0.14, alpha: 1).setFill()
            renderer.fill(CGRect(x: 116, y: 60, width: 8, height: 200))
        }
        var page = try ScanProcessor.cameraPhoto(image)
        page.filter = .gray
        page.adjustments = ScanAdjustments(shadows: 0, sharpness: 0)
        let before = try XCTUnwrap(UIImage(data: ScanProcessor.preview(page))?.cgImage)
        page.adjustments.shadows = 1
        let after = try XCTUnwrap(UIImage(data: ScanProcessor.preview(page))?.cgImage)
        XCTAssertGreaterThan(try gray(at: 80, in: after) - gray(at: 80, in: before), 50)
        XCTAssertGreaterThan(try gray(at: 80, in: after) - gray(at: 120, in: after), 100)
    }

    private func gray(at x: Int, in image: CGImage) throws -> Int {
        let pixel = try XCTUnwrap(image.cropping(to: CGRect(x: x, y: 160, width: 1, height: 1)))
        var value: UInt8 = 0
        try withUnsafeMutablePointer(to: &value) { buffer in
            let context = try XCTUnwrap(CGContext(data: buffer, width: 1, height: 1, bitsPerComponent: 8,
                                                bytesPerRow: 1, space: CGColorSpaceCreateDeviceGray(),
                                                bitmapInfo: CGImageAlphaInfo.none.rawValue))
            context.draw(pixel, in: CGRect(x: 0, y: 0, width: 1, height: 1))
        }
        return Int(value)
    }

    func testOrderedPDFContainsSearchableText() throws {
        var first = try page("QINGYAN FIRST PAGE", size: CGSize(width: 800, height: 600), orientation: .left)
        first.rotation = 1
        first.crop = ScanQuad(corners: [
            CGPoint(x: 0.02, y: 0.02), CGPoint(x: 0.97, y: 0.01),
            CGPoint(x: 0.98, y: 0.97), CGPoint(x: 0.01, y: 0.99)
        ])
        let second = try page("考研复习资料")
        let data = try ScanProcessor.pdf(pages: [second, first], paper: .a4, quality: .balanced, searchable: true)
        let pdf = try XCTUnwrap(PDFDocument(data: data))
        XCTAssertEqual(pdf.pageCount, 2)
        let portrait = try XCTUnwrap(pdf.page(at: 0))
        let landscape = try XCTUnwrap(pdf.page(at: 1))
        XCTAssertEqual(portrait.bounds(for: .mediaBox).width, 595.28, accuracy: 1)
        XCTAssertEqual(landscape.bounds(for: .mediaBox).width, 841.89, accuracy: 1)
        XCTAssertTrue(portrait.string?.contains("考研复习资料") == true, portrait.string ?? "Missing PDF text layer")
        XCTAssertTrue(landscape.string?.contains("FIRST PAGE") == true, landscape.string ?? "Missing PDF text layer")
        XCTAssertEqual(pdf.findString("考研", withOptions: []).count, 1)
    }

    func testCropAndFiltersProduceValidPreviews() throws {
        var draft = try page("DOCUMENT PREVIEW")
        draft.crop = ScanQuad(corners: [
            CGPoint(x: 0.1, y: 0.2), CGPoint(x: 0.9, y: 0.1),
            CGPoint(x: 0.9, y: 0.9), CGPoint(x: 0.1, y: 0.8)
        ])
        let cropped = try XCTUnwrap(UIImage(data: ScanProcessor.preview(draft))).size
        XCTAssertNotEqual(cropped, CGSize(width: 600, height: 800))
        XCTAssertGreaterThan(cropped.width, 0)
        XCTAssertGreaterThan(cropped.height, 0)
        for filter in ScanFilter.allCases {
            draft.filter = filter
            let preview = try XCTUnwrap(UIImage(data: ScanProcessor.preview(draft)))
            XCTAssertEqual(preview.size, cropped)
        }
        draft.crop.corners.swapAt(1, 2)
        XCTAssertThrowsError(try ScanProcessor.preview(draft))
    }

    private func page(_ text: String, size: CGSize = CGSize(width: 600, height: 800),
                      orientation: UIImage.Orientation = .up) throws -> ScanPage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: size, format: format).image { output in
            UIColor.white.setFill()
            output.fill(CGRect(origin: .zero, size: size))
            (text as NSString).draw(at: CGPoint(x: 36, y: 320), withAttributes: [
                .font: UIFont.boldSystemFont(ofSize: 42), .foregroundColor: UIColor.black
            ])
        }
        let raster = try XCTUnwrap(image.cgImage)
        var page = try ScanProcessor.cameraPhoto(UIImage(cgImage: raster, scale: 1, orientation: orientation))
        page.filter = .original
        return page
    }
}
