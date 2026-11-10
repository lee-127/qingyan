import UIKit
import CoreImage
import CoreText
import ImageIO
import Vision

struct ScanQuad: Equatable {
    // Clockwise, with a top-left origin and values in 0...1.
    var corners: [CGPoint]

    static let full = ScanQuad(corners: [
        .zero, CGPoint(x: 1, y: 0), CGPoint(x: 1, y: 1), CGPoint(x: 0, y: 1)
    ])

    var isValid: Bool {
        guard corners.count == 4, corners.allSatisfy({
            (0...1).contains($0.x) && (0...1).contains($0.y)
        }) else { return false }
        return corners.indices.allSatisfy { index in
            let a = corners[index], b = corners[(index + 1) % 4], c = corners[(index + 2) % 4]
            return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) > 0.01
        }
    }
}

enum ScanFilter: String, CaseIterable, Identifiable {
    case original = "原色"
    case enhanced = "文档增强"
    case gray = "灰度"
    case blackAndWhite = "黑白"
    var id: Self { self }
}

enum ScanPaper: String, CaseIterable, Identifiable {
    case a4 = "A4"
    case original = "原始比例"
    var id: Self { self }
}

enum ScanQuality: String, CaseIterable, Identifiable {
    case compact = "小体积"
    case balanced = "标准"
    case sharp = "高清"
    var id: Self { self }

    var encoding: (pixels: CGFloat, jpeg: CGFloat) {
        switch self {
        case .compact: return (1400, 0.61)
        case .balanced: return (2000, 0.76)
        case .sharp: return (2600, 0.88)
        }
    }
}

struct ScanPage: Identifiable {
    let id = UUID()
    let source: Data
    let thumbnail: Data
    let detectedCrop: ScanQuad
    var crop: ScanQuad
    var rotation = 0
    var filter: ScanFilter = .enhanced
    var adjustments = ScanAdjustments()
}

struct ScanAdjustments: Equatable {
    var shadows = 0.70
    var sharpness = 0.35
}

enum ScanProcessor {
    static let maxPages = 40
    static let maxPDFBytes = 20 * 1024 * 1024
    private static let sourcePixels: CGFloat = 2600
    private static let context = CIContext(options: [.cacheIntermediates: false])
    private static let flattenLight = CIColorKernel(source: """
        kernel vec4 flattenLight(__sample pixel, __sample paper, float strength) {
            vec3 corrected = clamp(pixel.rgb / max(paper.rgb, vec3(0.16)), 0.0, 1.0);
            return vec4(mix(pixel.rgb, corrected, strength), pixel.a);
        }
        """)

    static func importedPhoto(_ data: Data) throws -> ScanPage {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: Int(sourcePixels),
                kCGImageSourceShouldCacheImmediately: true,
              ] as CFDictionary) else {
            throw StudyError("无法读取所选照片")
        }
        let preview = resized(UIImage(cgImage: image), limit: 1000)
        let crop = preview.cgImage.flatMap(detectEdges) ?? .full
        return try draft(UIImage(cgImage: image), crop: crop)
    }

    static func cameraPhoto(_ image: UIImage) throws -> ScanPage {
        // VisionKit delivers an already rectified document.
        try draft(resized(image, limit: sourcePixels), crop: .full)
    }

    private static func draft(_ image: UIImage, crop: ScanQuad) throws -> ScanPage {
        guard let source = image.jpegData(compressionQuality: 0.9),
              let thumbnail = resized(image, limit: 200).jpegData(compressionQuality: 0.75) else {
            throw StudyError("无法保存扫描页面")
        }
        return ScanPage(source: source, thumbnail: thumbnail, detectedCrop: crop, crop: crop)
    }

    private static func detectEdges(_ image: CGImage) -> ScanQuad? {
        let handler = VNImageRequestHandler(cgImage: image)
        let document = VNDetectDocumentSegmentationRequest()
        if (try? handler.perform([document])) != nil, let rectangle = document.results?.first,
           let crop = quad(rectangle, minimumArea: 0.32) {
            return crop
        }
        let request = VNDetectRectanglesRequest()
        request.maximumObservations = 1
        request.minimumSize = 0.5
        request.minimumConfidence = 0.75
        do {
            try handler.perform([request])
            return request.results?.first.flatMap { quad($0, minimumArea: 0.45) }
        } catch {
            return nil
        }
    }

    private static func quad(_ rectangle: VNRectangleObservation, minimumArea: CGFloat) -> ScanQuad? {
        guard rectangle.boundingBox.width * rectangle.boundingBox.height >= minimumArea else { return nil }
        let crop = ScanQuad(corners: [
            rectangle.topLeft, rectangle.topRight, rectangle.bottomRight, rectangle.bottomLeft
        ].map { CGPoint(x: $0.x, y: 1 - $0.y) })
        return crop.isValid ? crop : nil
    }

    static func preview(_ page: ScanPage) throws -> Data {
        let image = try rendered(page, limit: 1100)
        guard let data = image.jpegData(compressionQuality: 0.83) else {
            throw StudyError("无法生成扫描预览")
        }
        return data
    }

    private static func rendered(_ page: ScanPage, limit: CGFloat) throws -> UIImage {
        guard var image = CIImage(data: page.source), page.crop.isValid else {
            throw StudyError("页面无法读取，请检查裁边范围")
        }
        if page.crop != .full {
            let extent = image.extent
            let points = page.crop.corners.map {
                CIVector(x: extent.minX + $0.x * extent.width, y: extent.maxY - $0.y * extent.height)
            }
            image = image.applyingFilter("CIPerspectiveCorrection", parameters: [
                "inputTopLeft": points[0], "inputTopRight": points[1],
                "inputBottomRight": points[2], "inputBottomLeft": points[3],
            ])
        }
        let orientations: [CGImagePropertyOrientation] = [.up, .right, .down, .left]
        image = image.oriented(orientations[page.rotation])
        let extent = image.extent
        guard extent.width > 0, extent.height > 0, !extent.isInfinite else {
            throw StudyError("裁边范围太小，请调整四个角")
        }
        let scale = min(1, limit / max(extent.width, extent.height))
        image = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        if page.filter != .original {
            image = correctedLighting(image, amount: page.adjustments.shadows)
            if page.adjustments.sharpness > 0 {
                image = image.applyingFilter("CISharpenLuminance", parameters: [
                    kCIInputSharpnessKey: page.adjustments.sharpness * 1.15
                ]).cropped(to: image.extent)
            }
        }
        switch page.filter {
        case .original:
            break
        case .enhanced:
            if let enhancer = CIFilter(name: "CIDocumentEnhancer", parameters: [
                kCIInputImageKey: image, "inputAmount": 0.35
            ]), let enhanced = enhancer.outputImage {
                image = enhanced
            } else {
                image = image.applyingFilter("CIColorControls", parameters: ["inputContrast": 1.18, "inputBrightness": 0.05])
            }
        case .gray:
            image = image.applyingFilter("CIColorControls", parameters: ["inputSaturation": 0])
        case .blackAndWhite:
            image = image.applyingFilter("CIColorControls", parameters: ["inputSaturation": 0])
                .applyingFilter("CIColorThreshold", parameters: ["inputThreshold": 0.63])
        }
        guard let raster = context.createCGImage(image, from: image.extent.integral) else {
            throw StudyError("无法处理该扫描页面")
        }
        return UIImage(cgImage: raster)
    }

    private static func correctedLighting(_ image: CIImage, amount: Double) -> CIImage {
        guard amount > 0 else { return image }
        let bounds = image.extent
        let scale = min(1, 180 / max(bounds.width, bounds.height))
        let shrink = CGAffineTransform(scaleX: scale, y: scale)
        // Estimate illumination from the paper around the letters.
        let paper = image.transformed(by: shrink).clampedToExtent()
            .applyingFilter("CIMorphologyMaximum", parameters: [kCIInputRadiusKey: 5])
            .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 2.5])
            .cropped(to: bounds.applying(shrink))
            .transformed(by: shrink.inverted())
        return flattenLight?.apply(extent: bounds, arguments: [image, paper, amount])
            ?? image.applyingFilter("CIDocumentEnhancer", parameters: ["inputAmount": amount])
    }

    static func pdf(pages: [ScanPage], paper: ScanPaper, quality: ScanQuality, searchable: Bool) throws -> Data {
        guard (1...maxPages).contains(pages.count) else { throw StudyError("每份 PDF 支持 1 至 40 页") }
        let a4 = CGSize(width: 595.28, height: 841.89)
        let format = UIGraphicsPDFRendererFormat()
        format.documentInfo = [kCGPDFContextCreator as String: "清研"]
        let renderer = UIGraphicsPDFRenderer(bounds: CGRect(origin: .zero, size: a4), format: format)
        var failure: Error?
        let pdf = renderer.pdfData { output in
            for (index, page) in pages.enumerated() {
                do {
                    try autoreleasepool {
                        try Task.checkCancellation()
                        let image = try rendered(page, limit: quality.encoding.pixels)
                        guard let compressed = image.jpegData(compressionQuality: quality.encoding.jpeg),
                              let printable = UIImage(data: compressed), let raster = image.cgImage else {
                            throw StudyError("无法压缩第 \(index + 1) 页")
                        }
                        let lines = searchable ? try recognize(raster) : []
                        let portrait = image.size.width <= image.size.height
                        let size = paper == .a4
                            ? (portrait ? a4 : CGSize(width: a4.height, height: a4.width))
                            : fitted(image.size, into: CGSize(width: a4.height, height: a4.height))
                        let bounds = CGRect(origin: .zero, size: size)
                        let content = fitted(image.size, into: size)
                        let rect = CGRect(x: (size.width - content.width) / 2, y: (size.height - content.height) / 2,
                                          width: content.width, height: content.height)
                        output.beginPage(withBounds: bounds, pageInfo: [:])
                        UIColor.white.setFill()
                        output.cgContext.fill(bounds)
                        printable.draw(in: rect)
                        drawSearchableText(lines, in: rect, context: output.cgContext)
                    }
                } catch {
                    failure = error
                    break
                }
            }
        }
        if let failure { throw failure }
        guard !pdf.isEmpty, pdf.count <= maxPDFBytes else {
            throw StudyError("PDF 超过 20 MB。请切换为小体积或分批保存。")
        }
        return pdf
    }

    private static func recognize(_ image: CGImage) throws -> [(String, CGRect)] {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        let supported = try request.supportedRecognitionLanguages()
        request.recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US"].filter(supported.contains)
        try VNImageRequestHandler(cgImage: image).perform([request])
        return (request.results ?? []).compactMap { observation in
            observation.topCandidates(1).first.map { ($0.string, observation.boundingBox) }
        }
    }

    private static func drawSearchableText(_ lines: [(String, CGRect)], in rect: CGRect, context: CGContext) {
        for (text, box) in lines where !text.isEmpty && box.width > 0 && box.height > 0 {
            let target = CGRect(x: rect.minX + box.minX * rect.width, y: rect.minY + (1 - box.maxY) * rect.height,
                                width: box.width * rect.width, height: box.height * rect.height)
            let font = CTFontCreateWithName("Helvetica" as CFString, target.height, nil)
            let line = CTLineCreateWithAttributedString(NSAttributedString(
                string: text, attributes: [NSAttributedString.Key(kCTFontAttributeName as String): font]
            ))
            var descent: CGFloat = 0
            let width = CGFloat(CTLineGetTypographicBounds(line, nil, &descent, nil))
            guard width > 0 else { continue }
            context.saveGState()
            context.translateBy(x: target.minX, y: target.maxY - descent)
            context.scaleBy(x: target.width / width, y: -1)
            context.textMatrix = .identity
            context.textPosition = .zero
            context.setTextDrawingMode(.invisible)
            CTLineDraw(line, context)
            context.restoreGState()
        }
    }

    private static func fitted(_ size: CGSize, into bounds: CGSize) -> CGSize {
        let scale = min(bounds.width / size.width, bounds.height / size.height)
        return CGSize(width: size.width * scale, height: size.height * scale)
    }

    static func resized(_ image: UIImage, limit: CGFloat) -> UIImage {
        let pixels = CGSize(width: image.size.width * image.scale, height: image.size.height * image.scale)
        let size = max(pixels.width, pixels.height) > limit
            ? fitted(pixels, into: CGSize(width: limit, height: limit)) : pixels
        let bounds = CGRect(x: 0, y: 0, width: max(1, size.width.rounded()), height: max(1, size.height.rounded()))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(bounds: bounds, format: format).image { context in
            UIColor.white.setFill()
            context.fill(bounds)
            image.draw(in: bounds)
        }
    }
}
