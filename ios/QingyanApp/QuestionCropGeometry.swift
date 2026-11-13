import UIKit

enum QuestionCropGeometry {
    enum Handle: CaseIterable {
        case topLeft, top, topRight, right, bottomRight, bottom, bottomLeft, left

        func point(in rect: CGRect) -> CGPoint {
            switch self {
            case .topLeft: return CGPoint(x: rect.minX, y: rect.minY)
            case .top: return CGPoint(x: rect.midX, y: rect.minY)
            case .topRight: return CGPoint(x: rect.maxX, y: rect.minY)
            case .right: return CGPoint(x: rect.maxX, y: rect.midY)
            case .bottomRight: return CGPoint(x: rect.maxX, y: rect.maxY)
            case .bottom: return CGPoint(x: rect.midX, y: rect.maxY)
            case .bottomLeft: return CGPoint(x: rect.minX, y: rect.maxY)
            case .left: return CGPoint(x: rect.minX, y: rect.midY)
            }
        }

        var label: String {
            switch self {
            case .topLeft: return "左上角"
            case .top: return "上边"
            case .topRight: return "右上角"
            case .right: return "右边"
            case .bottomRight: return "右下角"
            case .bottom: return "下边"
            case .bottomLeft: return "左下角"
            case .left: return "左边"
            }
        }
    }

    static func moved(_ rect: CGRect, delta: CGPoint) -> CGRect {
        let dx = max(-rect.minX, min(1 - rect.maxX, delta.x))
        let dy = max(-rect.minY, min(1 - rect.maxY, delta.y))
        return rect.offsetBy(dx: dx, dy: dy)
    }

    static func resized(_ rect: CGRect, handle: Handle, to point: CGPoint, minimum: CGSize) -> CGRect {
        var left = rect.minX, top = rect.minY, right = rect.maxX, bottom = rect.maxY
        switch handle {
        case .topLeft, .left, .bottomLeft: left = max(0, min(right - minimum.width, point.x))
        default: break
        }
        switch handle {
        case .topLeft, .top, .topRight: top = max(0, min(bottom - minimum.height, point.y))
        default: break
        }
        switch handle {
        case .topRight, .right, .bottomRight: right = min(1, max(left + minimum.width, point.x))
        default: break
        }
        switch handle {
        case .bottomLeft, .bottom, .bottomRight: bottom = min(1, max(top + minimum.height, point.y))
        default: break
        }
        return CGRect(x: left, y: top, width: right - left, height: bottom - top)
    }

    static func imageFrame(size: CGSize, in viewport: CGRect, fill: Bool) -> CGRect {
        guard size.width > 0, size.height > 0, viewport.width > 0, viewport.height > 0 else { return .zero }
        let sx = viewport.width / size.width, sy = viewport.height / size.height
        let scale = fill ? max(sx, sy) : min(sx, sy)
        let scaled = CGSize(width: size.width * scale, height: size.height * scale)
        return CGRect(x: viewport.midX - scaled.width / 2, y: viewport.midY - scaled.height / 2,
                      width: scaled.width, height: scaled.height)
    }

    static func pixelRect(selection: CGRect, viewport: CGRect, pixels: CGSize, fill: Bool) -> CGRect {
        let displayed = imageFrame(size: pixels, in: viewport, fill: fill)
        guard displayed.width > 0, displayed.height > 0 else { return .zero }
        let visible = fill ? viewport : displayed
        let chosen = CGRect(x: visible.minX + selection.minX * visible.width,
                            y: visible.minY + selection.minY * visible.height,
                            width: selection.width * visible.width, height: selection.height * visible.height)
        let result = CGRect(x: (chosen.minX - displayed.minX) / displayed.width * pixels.width,
                            y: (chosen.minY - displayed.minY) / displayed.height * pixels.height,
                            width: chosen.width / displayed.width * pixels.width,
                            height: chosen.height / displayed.height * pixels.height)
        return result.integral.intersection(CGRect(origin: .zero, size: pixels))
    }
}

final class QuestionCropOverlay: UIView {
    var selection = CGRect(x: 0.08, y: 0.27, width: 0.84, height: 0.38) {
        didSet { setNeedsDisplay(); updateAccessibility() }
    }
    private enum Action { case resize(QuestionCropGeometry.Handle), move, draw }
    private var action: Action?
    private var origin = CGPoint.zero
    private var initial = CGRect.zero
    private var accessibilityHandles: [UIAccessibilityElement] = []

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isOpaque = false
        let pan = UIPanGestureRecognizer(target: self, action: #selector(panned))
        pan.maximumNumberOfTouches = 1
        addGestureRecognizer(pan)
        for handle in QuestionCropGeometry.Handle.allCases {
            let element = CropAccessibilityElement(accessibilityContainer: self)
            element.accessibilityLabel = "调整" + handle.label
            element.accessibilityTraits = .adjustable
            element.change = { [weak self] direction in
                guard let self else { return }
                let point = handle.point(in: self.selection)
                let horizontal = [QuestionCropGeometry.Handle.left, .right, .topLeft, .topRight, .bottomLeft, .bottomRight].contains(handle)
                self.selection = QuestionCropGeometry.resized(self.selection, handle: handle,
                    to: CGPoint(x: point.x + (horizontal ? direction * 0.02 : 0),
                                y: point.y + (horizontal ? 0 : direction * 0.02)), minimum: self.minimum)
            }
            accessibilityHandles.append(element)
        }
        accessibilityElements = accessibilityHandles
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    private var minimum: CGSize {
        CGSize(width: min(0.2, 44 / max(1, bounds.width)), height: min(0.2, 44 / max(1, bounds.height)))
    }
    private var selectedFrame: CGRect {
        CGRect(x: selection.minX * bounds.width, y: selection.minY * bounds.height,
               width: selection.width * bounds.width, height: selection.height * bounds.height)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        updateAccessibility()
    }

    private func updateAccessibility() {
        for (index, handle) in QuestionCropGeometry.Handle.allCases.enumerated() where index < accessibilityHandles.count {
            let point = handle.point(in: selectedFrame)
            accessibilityHandles[index].accessibilityFrameInContainerSpace = CGRect(x: point.x - 22, y: point.y - 22, width: 44, height: 44)
        }
    }

    override func draw(_ rect: CGRect) {
        let selected = selectedFrame
        let shade = UIBezierPath(rect: bounds)
        shade.append(UIBezierPath(rect: selected))
        shade.usesEvenOddFillRule = true
        UIColor.black.withAlphaComponent(0.52).setFill()
        shade.fill()
        UIColor.white.setStroke()
        let border = UIBezierPath(rect: selected)
        border.lineWidth = 1.5
        border.stroke()
        for handle in QuestionCropGeometry.Handle.allCases {
            let point = handle.point(in: selected)
            let dot = UIBezierPath(roundedRect: CGRect(x: point.x - 5, y: point.y - 5, width: 10, height: 10), cornerRadius: 3)
            UIColor.white.setFill()
            dot.fill()
        }
    }

    @objc private func panned(_ pan: UIPanGestureRecognizer) {
        guard bounds.width > 0, bounds.height > 0 else { return }
        let location = pan.location(in: self)
        let at = CGPoint(x: location.x / bounds.width, y: location.y / bounds.height)
        if pan.state == .began {
            origin = at
            initial = selection
            let nearest = QuestionCropGeometry.Handle.allCases.min { a, b in
                let pa = a.point(in: selectedFrame), pb = b.point(in: selectedFrame)
                return hypot(pa.x - location.x, pa.y - location.y) < hypot(pb.x - location.x, pb.y - location.y)
            }!
            let anchor = nearest.point(in: selectedFrame)
            if hypot(anchor.x - location.x, anchor.y - location.y) <= 30 { action = .resize(nearest) }
            else { action = selectedFrame.contains(location) ? .move : .draw }
        }
        switch action {
        case .resize(let handle):
            selection = QuestionCropGeometry.resized(initial, handle: handle, to: at, minimum: minimum)
        case .move:
            selection = QuestionCropGeometry.moved(initial, delta: CGPoint(x: at.x - origin.x, y: at.y - origin.y))
        case .draw:
            let x = min(1, max(0, at.x)), y = min(1, max(0, at.y))
            if abs(x - origin.x) >= minimum.width && abs(y - origin.y) >= minimum.height {
                selection = CGRect(x: min(x, origin.x), y: min(y, origin.y), width: abs(x - origin.x), height: abs(y - origin.y))
            }
        case nil: break
        }
        if pan.state == .cancelled || pan.state == .failed { selection = initial }
        if pan.state == .ended || pan.state == .cancelled || pan.state == .failed { action = nil }
    }
}

private final class CropAccessibilityElement: UIAccessibilityElement {
    var change: ((CGFloat) -> Void)?
    override func accessibilityIncrement() { change?(1) }
    override func accessibilityDecrement() { change?(-1) }
}
