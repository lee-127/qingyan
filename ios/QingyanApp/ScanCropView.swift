import SwiftUI

struct ScanCropView: View {
    let page: ScanPage
    let onApply: (ScanQuad) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var crop: ScanQuad

    init(page: ScanPage, onApply: @escaping (ScanQuad) -> Void) {
        self.page = page
        self.onApply = onApply
        _crop = State(initialValue: page.crop)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                Text(crop.isValid ? "将四个角对齐纸张边缘，应用后会拉正斜拍的页面。" : "四个角需要按顺序围住页面，并留出足够面积。")
                    .font(.footnote)
                    .foregroundStyle(crop.isValid ? Color.secondary : Color.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
                if let image = UIImage(data: page.source) {
                    cropCanvas(image)
                }
                HStack {
                    Button("保留整页") { crop = .full }
                    if page.detectedCrop != .full {
                        Button("恢复自动校正") { crop = page.detectedCrop }
                    }
                }
                .buttonStyle(.bordered)
            }
            .padding(.vertical, 16)
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("校正纸张边缘")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("应用") {
                        onApply(crop)
                        dismiss()
                    }
                    .fontWeight(.semibold)
                    .disabled(!crop.isValid)
                }
            }
        }
    }

    private func cropCanvas(_ image: UIImage) -> some View {
        GeometryReader { proxy in
            let scale = min(max(1, proxy.size.width - 56) / image.size.width,
                            max(1, proxy.size.height - 56) / image.size.height)
            let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
            let frame = CGRect(x: (proxy.size.width - size.width) / 2, y: (proxy.size.height - size.height) / 2,
                               width: size.width, height: size.height)
            let points = crop.corners.map {
                CGPoint(x: frame.minX + $0.x * frame.width, y: frame.minY + $0.y * frame.height)
            }
            let outline = Path { path in
                path.addLines(points)
                path.closeSubpath()
            }
            let color = crop.isValid ? Color.accentColor : .red
            ZStack {
                Image(uiImage: image)
                    .resizable()
                    .frame(width: frame.width, height: frame.height)
                    .position(x: frame.midX, y: frame.midY)
                    .accessibilityHidden(true)
                Path { path in
                    path.addRect(frame)
                    path.addPath(outline)
                }
                .fill(.black.opacity(0.42), style: FillStyle(eoFill: true))
                .allowsHitTesting(false)
                outline.stroke(color, lineWidth: 2).allowsHitTesting(false)
                ForEach(points.indices, id: \.self) { index in
                    Circle()
                        .fill(color)
                        .overlay { Circle().strokeBorder(.white, lineWidth: 2) }
                        .frame(width: 20, height: 20)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                        .position(points[index])
                        .gesture(DragGesture(minimumDistance: 0, coordinateSpace: .named("scanCrop")).onChanged { drag in
                            crop.corners[index] = CGPoint(
                                x: min(1, max(0, (drag.location.x - frame.minX) / frame.width)),
                                y: min(1, max(0, (drag.location.y - frame.minY) / frame.height))
                            )
                        })
                        .accessibilityLabel(["左上角", "右上角", "右下角", "左下角"][index])
                }
            }
            .coordinateSpace(name: "scanCrop")
        }
    }
}
