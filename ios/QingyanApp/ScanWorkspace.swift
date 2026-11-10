import AVFoundation
import PhotosUI
import SwiftUI
import VisionKit

struct ScanWorkspace: View {
    let onFinish: (Data?) -> Void

    @State private var pages: [ScanPage] = []
    @State private var selection: UUID?
    @State private var preview: UIImage?
    @State private var previewPageID: UUID?
    @State private var previewFailed = false
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var showCamera = false
    @State private var croppingPage: ScanPage?
    @State private var showExport = false
    @State private var confirmDiscard = false
    @State private var paper: ScanPaper = .a4
    @State private var quality: ScanQuality = .balanced
    @State private var searchable = true
    @State private var activity: String?
    @State private var error: String?
    @State private var finished = false

    private var selectedIndex: Int? { pages.firstIndex { $0.id == selection } }
    private var selectedPage: ScanPage? { selectedIndex.map { pages[$0] } }
    private var remaining: Int { ScanProcessor.maxPages - pages.count }
    private var locked: Bool { activity != nil || finished }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    inputButtons
                    if let activity {
                        ProgressView(activity)
                            .frame(maxWidth: .infinity)
                            .padding(12)
                            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
                    }
                    if let index = selectedIndex {
                        pageEditor(index)
                    } else {
                        emptyState
                    }
                }
                .frame(maxWidth: 760)
                .padding(16)
                .frame(maxWidth: .infinity)
            }
            .background {
                LinearGradient(colors: [Color(red: 0.83, green: 0.92, blue: 0.89), Color(uiColor: .systemGroupedBackground)],
                               startPoint: .topTrailing, endPoint: .bottomLeading)
                    .ignoresSafeArea()
            }
            .navigationTitle("智能扫描")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("关闭") {
                        if pages.isEmpty { finish(nil) } else { confirmDiscard = true }
                    }
                    .disabled(locked)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("生成 PDF") { showExport = true }
                        .fontWeight(.semibold)
                        .disabled(pages.isEmpty || locked)
                }
            }
            .confirmationDialog("放弃这份扫描？", isPresented: $confirmDiscard, titleVisibility: .visible) {
                Button("放弃扫描", role: .destructive) { finish(nil) }
                Button("继续编辑", role: .cancel) {}
            }
            .alert("智能扫描", isPresented: Binding(
                get: { error != nil },
                set: { if !$0 { error = nil } }
            )) {
                Button("好", role: .cancel) { error = nil }
            } message: {
                Text(error ?? "")
            }
        }
        .tint(Color(red: 0.16, green: 0.43, blue: 0.34))
        .task(id: selectedPage.map(PreviewKey.init)) {
            previewFailed = false
            guard let page = selectedPage else { return }
            if previewPageID != page.id { preview = nil }
            // Wait briefly for rapid slider changes to settle before reprocessing the page.
            try? await Task.sleep(nanoseconds: 120_000_000)
            guard !Task.isCancelled else { return }
            let result = await Task.detached(priority: .userInitiated) {
                try? autoreleasepool { try ScanProcessor.preview(page) }
            }.value
            if !Task.isCancelled {
                preview = result.flatMap { UIImage(data: $0) }
                previewPageID = page.id
                previewFailed = preview == nil
            }
        }
        .onChange(of: photoItems) { items in
            guard !items.isEmpty else { return }
            photoItems = []
            importPhotos(Array(items.prefix(remaining)))
        }
        .fullScreenCover(isPresented: $showCamera) {
            ScanCamera { result in
                showCamera = false
                switch result {
                case .success(let scan):
                    if let scan { importCamera(scan) }
                case .failure(let failure):
                    error = failure.localizedDescription
                }
            }
            .ignoresSafeArea()
        }
        .sheet(item: $croppingPage) { page in
            ScanCropView(page: page) { crop in
                if let index = pages.firstIndex(where: { $0.id == page.id }) {
                    pages[index].crop = crop
                }
            }
        }
        .sheet(isPresented: $showExport) {
            exportOptions
        }
    }

    private var inputButtons: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Button {
                    if !VNDocumentCameraViewController.isSupported {
                        error = "当前设备无法使用文档相机，可以从相册导入照片。"
                    } else if [.denied, .restricted].contains(AVCaptureDevice.authorizationStatus(for: .video)) {
                        error = "请在系统设置中允许清研访问相机。"
                    } else {
                        showCamera = true
                    }
                } label: {
                    Label("相机扫描", systemImage: "doc.viewfinder").frame(maxWidth: .infinity)
                }
                .modifier(ScanControlStyle(prominent: true))
                PhotosPicker(selection: $photoItems, maxSelectionCount: max(1, remaining),
                             selectionBehavior: .ordered, matching: .images) {
                    Label("从相册导入", systemImage: "photo.on.rectangle").frame(maxWidth: .infinity)
                }
                .modifier(ScanControlStyle())
            }
            .controlSize(.large)
            .disabled(locked || remaining == 0)
            Text("已添加 \(pages.count) / \(ScanProcessor.maxPages) 页")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .monospacedDigit()
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "doc.viewfinder")
                .font(.system(size: 44))
                .foregroundStyle(Color.accentColor)
                .accessibilityHidden(true)
            Text("把纸质资料变成 PDF").font(.title3.bold())
            Text("连续拍摄多页，或从相册选取照片。你可以逐页调整边缘、方向和字迹。")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(28)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
    }

    private func pageEditor(_ index: Int) -> some View {
        let page = pages[index]
        return VStack(spacing: 14) {
            HStack {
                Text("第 \(index + 1) 页").font(.headline)
                Spacer()
                Button(role: .destructive) { removePage(index) } label: {
                    Label("删除此页", systemImage: "trash")
                        .labelStyle(.iconOnly)
                        .padding(7)
                }
            }
            ZStack {
                RoundedRectangle(cornerRadius: 14).fill(Color(uiColor: .secondarySystemGroupedBackground))
                if let preview {
                    Image(uiImage: preview)
                        .resizable()
                        .scaledToFit()
                        .padding(10)
                        .accessibilityLabel("第 \(index + 1) 页扫描预览")
                } else if previewFailed {
                    Label("无法预览，请检查裁边或更换滤镜", systemImage: "exclamationmark.triangle")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } else {
                    ProgressView()
                }
            }
            .frame(height: 320)
            thumbnails
            HStack(spacing: 8) {
                editButton("校正", icon: "crop") { croppingPage = page }
                editButton("左转", icon: "rotate.left") { pages[index].rotation = (page.rotation + 3) % 4 }
                editButton("右转", icon: "rotate.right") { pages[index].rotation = (page.rotation + 1) % 4 }
                editButton("前移", icon: "arrow.left") { pages.swapAt(index, index - 1) }
                    .disabled(index == 0)
                editButton("后移", icon: "arrow.right") { pages.swapAt(index, index + 1) }
                    .disabled(index == pages.count - 1)
            }
            Picker("滤镜", selection: Binding(
                get: { pages.first(where: { $0.id == page.id })?.filter ?? page.filter },
                set: { filter in
                    if let current = pages.firstIndex(where: { $0.id == page.id }) { pages[current].filter = filter }
                }
            )) {
                ForEach(ScanFilter.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            if page.filter != .original {
                VStack(alignment: .leading, spacing: 10) {
                    adjustment("去阴影", id: page.id, keyPath: \.shadows)
                    adjustment("文字锐化", id: page.id, keyPath: \.sharpness)
                    Button("恢复自动增强") { pages[index].adjustments = ScanAdjustments() }
                        .font(.footnote)
                }
                .padding(12)
                .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
            }
            if pages.count > 1 {
                Button("将当前增强效果应用到全部页面") {
                    for index in pages.indices {
                        pages[index].filter = page.filter
                        pages[index].adjustments = page.adjustments
                    }
                }
                .font(.footnote)
            }
        }
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
        .disabled(locked)
    }

    private func adjustment(_ title: String, id: UUID, keyPath: WritableKeyPath<ScanAdjustments, Double>) -> some View {
        let value = Binding(
            get: { pages.first(where: { $0.id == id })?.adjustments[keyPath: keyPath] ?? 0 },
            set: { amount in
                if let index = pages.firstIndex(where: { $0.id == id }) {
                    pages[index].adjustments[keyPath: keyPath] = amount
                }
            }
        )
        return VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.subheadline)
            Slider(value: value, in: 0...1, step: 0.05) { Text(title) }
        }
    }

    private var thumbnails: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    ForEach(Array(pages.enumerated()), id: \.element.id) { index, page in
                        Button {
                            selection = page.id
                        } label: {
                            VStack(spacing: 4) {
                                if let image = UIImage(data: page.thumbnail) {
                                    Image(uiImage: image).resizable().scaledToFit()
                                        .rotationEffect(.degrees(Double(page.rotation) * 90))
                                        .frame(width: 44, height: 44)
                                }
                                Text("\(index + 1)").font(.caption2.monospacedDigit())
                            }
                            .frame(width: 56, height: 67)
                            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 8))
                            .overlay {
                                RoundedRectangle(cornerRadius: 8)
                                    .strokeBorder(page.id == selection ? Color.accentColor : .clear, lineWidth: 2)
                            }
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("第 \(index + 1) 页")
                        .accessibilityAddTraits(page.id == selection ? .isSelected : [])
                        .id(page.id)
                    }
                }
            }
            .scrollIndicators(.hidden)
            .onChange(of: selection) { id in
                if let id { withAnimation { proxy.scrollTo(id, anchor: .center) } }
            }
        }
    }

    private func editButton(_ title: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 5) {
                Image(systemName: icon).font(.body)
                Text(title).font(.caption)
            }
            .frame(maxWidth: .infinity, minHeight: 44)
        }
        .modifier(ScanControlStyle())
    }

    private var exportOptions: some View {
        NavigationStack {
            Form {
                Section("页面与清晰度") {
                    Picker("纸张", selection: $paper) {
                        ForEach(ScanPaper.allCases) { Text($0.rawValue).tag($0) }
                    }
                    Picker("清晰度", selection: $quality) {
                        ForEach(ScanQuality.allCases) { Text($0.rawValue).tag($0) }
                    }
                }
                Section {
                    Toggle("识别文字，生成可搜索 PDF", isOn: $searchable)
                } footer: {
                    Text("在设备上识别中文和英文，保留扫描页原貌。每份 PDF 上限 20 MB。")
                }
            }
            .navigationTitle("PDF 导出设置")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("返回") { showExport = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("生成") {
                        showExport = false
                        generatePDF()
                    }
                    .fontWeight(.semibold)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func removePage(_ index: Int) {
        pages.remove(at: index)
        selection = pages.isEmpty ? nil : pages[min(index, pages.count - 1)].id
    }

    private func addPages(_ additions: [ScanPage]) {
        pages.append(contentsOf: additions)
        if let first = additions.first { selection = first.id }
    }

    private func importPhotos(_ items: [PhotosPickerItem]) {
        activity = "正在读取照片…"
        Task { @MainActor in
            var additions: [ScanPage] = []
            for (index, item) in items.enumerated() {
                activity = "正在导入 \(index + 1) / \(items.count) 页…"
                do {
                    guard let data = try await item.loadTransferable(type: Data.self) else { continue }
                    additions.append(try await Task.detached(priority: .userInitiated) {
                        try autoreleasepool { try ScanProcessor.importedPhoto(data) }
                    }.value)
                } catch {
                    continue
                }
            }
            addPages(additions)
            activity = nil
            let failures = items.count - additions.count
            if failures > 0 { error = "有 \(failures) 张照片无法读取，请确认照片已下载到设备，再尝试导入。" }
        }
    }

    private func importCamera(_ scan: VNDocumentCameraScan) {
        let count = min(scan.pageCount, remaining)
        guard count > 0 else { return }
        activity = "正在读取扫描…"
        Task { @MainActor in
            var additions: [ScanPage] = []
            for index in 0..<count {
                activity = "正在添加 \(index + 1) / \(count) 页…"
                do {
                    let image = scan.imageOfPage(at: index)
                    additions.append(try await Task.detached(priority: .userInitiated) {
                        try autoreleasepool { try ScanProcessor.cameraPhoto(image) }
                    }.value)
                } catch {
                    continue
                }
            }
            addPages(additions)
            activity = nil
            if additions.count < scan.pageCount {
                error = "已添加 \(additions.count) 页，另有 \(scan.pageCount - additions.count) 页超出上限或读取失败。"
            }
        }
    }

    private func generatePDF() {
        let draft = pages, size = paper, compression = quality, recognizeText = searchable
        activity = "正在生成 \(draft.count) 页 PDF…"
        Task { @MainActor in
            do {
                let data = try await Task.detached(priority: .userInitiated) {
                    try ScanProcessor.pdf(pages: draft, paper: size, quality: compression, searchable: recognizeText)
                }.value
                finish(data)
            } catch let failure {
                activity = nil
                error = failure.localizedDescription
            }
        }
    }

    private func finish(_ data: Data?) {
        guard !finished else { return }
        finished = true
        onFinish(data)
    }
}

private struct PreviewKey: Equatable {
    let id: UUID
    let crop: ScanQuad
    let rotation: Int
    let filter: ScanFilter
    let adjustments: ScanAdjustments

    init(_ page: ScanPage) {
        id = page.id
        crop = page.crop
        rotation = page.rotation
        filter = page.filter
        adjustments = page.adjustments
    }
}

private struct ScanControlStyle: ViewModifier {
    var prominent = false

    @ViewBuilder
    func body(content: Content) -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            if prominent { content.buttonStyle(.glassProminent) }
            else { content.buttonStyle(.glass) }
        } else {
            fallback(content)
        }
        #else
        fallback(content)
        #endif
    }

    @ViewBuilder
    private func fallback(_ content: Content) -> some View {
        if prominent { content.buttonStyle(.borderedProminent) }
        else { content.buttonStyle(.bordered) }
    }
}

private struct ScanCamera: UIViewControllerRepresentable {
    let onFinish: (Result<VNDocumentCameraScan?, Error>) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onFinish) }

    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let controller = VNDocumentCameraViewController()
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ uiViewController: VNDocumentCameraViewController, context: Context) {}

    final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
        let onFinish: (Result<VNDocumentCameraScan?, Error>) -> Void

        init(_ onFinish: @escaping (Result<VNDocumentCameraScan?, Error>) -> Void) {
            self.onFinish = onFinish
        }

        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
            onFinish(.success(nil))
        }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
            onFinish(.success(scan))
        }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
            onFinish(.failure(error))
        }
    }
}
