import UIKit
import PDFKit

enum ExercisePDF {
    static func render(_ url: URL, page number: Int) throws -> [String: Any] {
        guard let document = PDFDocument(url: url), !document.isLocked, document.pageCount > 0 else {
            throw StudyError("无法打开 PDF，请检查文件是否损坏或加密")
        }
        guard number >= 1, let page = document.page(at: number - 1) else {
            throw StudyError("请输入 1 至 \(document.pageCount) 之间的页码")
        }
        let bounds = page.bounds(for: .cropBox)
        guard bounds.width > 0, bounds.height > 0, bounds.width.isFinite, bounds.height.isFinite else {
            throw StudyError("PDF 页面尺寸无效")
        }
        let scale = min(3, 2400 / max(bounds.width, bounds.height))
        let size = CGSize(width: max(1, bounds.width * scale), height: max(1, bounds.height * scale))
        let thumbnail = page.thumbnail(of: size, for: .cropBox)
        guard let data = thumbnail.jpegData(compressionQuality: 0.92) else {
            throw StudyError("无法生成该页的预览")
        }
        return ["base64": data.base64EncodedString(), "pages": document.pageCount]
    }
}
