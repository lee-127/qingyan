import AVFoundation
import ImageIO
import UIKit

@MainActor
final class QuestionCameraController: UIViewController {
    var onFinish: ((Result<Data?, Error>) -> Void)?
    private let engine = QuestionCameraSession()
    private let canvas = UIView()
    private let picture = UIImageView()
    private let selection = QuestionCropOverlay()
    private lazy var preview = AVCaptureVideoPreviewLayer(session: engine.session)
    private let hint = UILabel()
    private let primary = UIButton(type: .system)
    private let secondary = UIButton(type: .system)
    private let close = UIButton(type: .system)
    private let whole = UIButton(type: .system)
    private var photo: UIImage?
    private let cameraSource: Bool
    private var ready = false
    private var processing = false
    private var finished = false
    private var observers: [NSObjectProtocol] = []

    init(photo: UIImage? = nil) {
        self.photo = photo
        self.cameraSource = photo == nil
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
        isModalInPresentation = true
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        canvas.backgroundColor = UIColor(white: 0.08, alpha: 1)
        canvas.clipsToBounds = true
        preview.videoGravity = .resizeAspectFill
        if cameraSource { canvas.layer.addSublayer(preview) }
        picture.contentMode = cameraSource ? .scaleAspectFill : .scaleAspectFit
        picture.clipsToBounds = true
        canvas.addSubview(picture)
        canvas.addSubview(selection)
        canvas.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(canvas)

        close.setTitle("取消", for: .normal)
        close.accessibilityLabel = "取消选题"
        close.addTarget(self, action: #selector(cancel), for: .touchUpInside)
        whole.setTitle("全图", for: .normal)
        whole.addTarget(self, action: #selector(useWhole), for: .touchUpInside)
        let title = UILabel()
        title.text = "框选题目"
        title.textColor = .white
        title.font = .preferredFont(forTextStyle: .headline)
        title.textAlignment = .center
        let header = UIStackView(arrangedSubviews: [close, title, whole])
        header.distribution = .equalCentering
        header.alignment = .center
        header.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(header)

        hint.textColor = .white
        hint.font = .preferredFont(forTextStyle: .subheadline)
        hint.numberOfLines = 0
        hint.textAlignment = .center
        primary.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        primary.configuration = .filled()
        primary.configuration?.baseBackgroundColor = UIColor(red: 0.17, green: 0.47, blue: 0.36, alpha: 1)
        primary.configuration?.cornerStyle = .capsule
        primary.configuration?.contentInsets = NSDirectionalEdgeInsets(top: 15, leading: 24, bottom: 15, trailing: 24)
        primary.addTarget(self, action: #selector(primaryAction), for: .touchUpInside)
        secondary.addTarget(self, action: #selector(retake), for: .touchUpInside)
        for button in [close, whole, secondary] {
            button.tintColor = .white
            button.titleLabel?.font = .preferredFont(forTextStyle: .body)
            button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
        }
        let footer = UIStackView(arrangedSubviews: [hint, primary, secondary])
        footer.axis = .vertical
        footer.spacing = 12
        footer.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(footer)
        NSLayoutConstraint.activate([
            header.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20),
            header.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -20),
            header.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 4),
            canvas.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 10),
            canvas.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 12),
            canvas.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -12),
            canvas.bottomAnchor.constraint(equalTo: footer.topAnchor, constant: -16),
            footer.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24),
            footer.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24),
            footer.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -8),
        ])
        if !cameraSource { selection.selection = CGRect(x: 0.06, y: 0.10, width: 0.88, height: 0.80) }
        updateControls()
        observers.append(NotificationCenter.default.addObserver(
            forName: UIApplication.willResignActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in self?.engine.stop() })
        observers.append(NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in
            guard let self, self.cameraSource, self.photo == nil, !self.finished else { return }
            self.startCamera()
        })
        observers.append(NotificationCenter.default.addObserver(
            forName: .AVCaptureSessionRuntimeError, object: engine.session, queue: .main
        ) { [weak self] _ in self?.showCameraError("相机暂时不可用，请重试。") })
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if cameraSource && photo == nil { startCamera() }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        engine.stop()
    }

    deinit {
        observers.forEach(NotificationCenter.default.removeObserver)
        engine.stop()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        preview.frame = canvas.bounds
        picture.frame = canvas.bounds
        if let photo, !cameraSource {
            selection.frame = QuestionCropGeometry.imageFrame(size: photo.size, in: canvas.bounds, fill: false)
        } else {
            selection.frame = canvas.bounds
        }
        if let connection = preview.connection, connection.isVideoOrientationSupported {
            connection.videoOrientation = orientation
        }
    }

    private var orientation: AVCaptureVideoOrientation {
        switch view.window?.windowScene?.interfaceOrientation {
        case .landscapeLeft: return .landscapeLeft
        case .landscapeRight: return .landscapeRight
        case .portraitUpsideDown: return .portraitUpsideDown
        default: return .portrait
        }
    }

    private func startCamera() {
        ready = false
        updateControls()
        let access = AVCaptureDevice.authorizationStatus(for: .video)
        if access == .notDetermined {
            AVCaptureDevice.requestAccess(for: .video) { [weak self] allowed in
                Task { @MainActor in
                    guard let self, !self.finished else { return }
                    if allowed { self.startCamera() }
                    else { self.showCameraError("请在系统设置中允许访问相机。") }
                }
            }
            return
        }
        guard access == .authorized else { showCameraError("请在系统设置中允许访问相机。"); return }
        engine.start { [weak self] result in
            guard let self, !self.finished, self.photo == nil else { return }
            switch result {
            case .success:
                self.ready = true
                self.view.setNeedsLayout()
                self.updateControls()
            case .failure(let error):
                self.showCameraError(error.localizedDescription)
            }
        }
    }

    private func updateControls() {
        picture.image = photo
        picture.isHidden = photo == nil
        primary.setTitle(photo == nil ? (ready ? "拍下题目" : "重试相机") : "使用选区", for: .normal)
        primary.isEnabled = !processing
        whole.isEnabled = !processing
        selection.isUserInteractionEnabled = !processing
        secondary.isHidden = photo == nil || !cameraSource
        secondary.isEnabled = !processing
        secondary.setTitle("重拍", for: .normal)
        close.isEnabled = !processing
        hint.text = processing ? "正在处理题图…" : photo == nil
            ? "先框住一道题，再拍摄。框内拖动可移动，拖边可缩放。"
            : "调整选区，保留完整题干、选项和图表，再点使用选区。"
        view.setNeedsLayout()
    }

    private func showCameraError(_ message: String) {
        guard !finished else { return }
        ready = false
        processing = false
        updateControls()
        hint.text = message
    }

    @objc private func cancel() {
        complete(.success(nil))
    }

    @objc private func useWhole() {
        selection.selection = CGRect(x: 0, y: 0, width: 1, height: 1)
    }

    @objc private func retake() {
        photo = nil
        updateControls()
        startCamera()
    }

    @objc private func primaryAction() {
        guard !processing else { return }
        if let photo {
            guard let raster = photo.cgImage else { return }
            let pixels = CGSize(width: raster.width, height: raster.height)
            let rect = QuestionCropGeometry.pixelRect(selection: selection.selection, viewport: canvas.bounds,
                                                      pixels: pixels, fill: cameraSource)
            guard rect.width >= 2, rect.height >= 2, let cropped = raster.cropping(to: rect),
                  let data = UIImage(cgImage: cropped).jpegData(compressionQuality: 0.92) else {
                hint.text = "选区太小或读取失败，请扩大题目范围。"
                return
            }
            complete(.success(data))
        } else if ready {
            processing = true
            updateControls()
            engine.capture(orientation: orientation) { [weak self] result in
                guard let self, !self.finished else { return }
                self.processing = false
                switch result {
                case .success(let image):
                    self.photo = image
                    self.engine.stop()
                    self.updateControls()
                case .failure(let error):
                    self.updateControls()
                    self.hint.text = error.localizedDescription
                }
            }
        } else {
            startCamera()
        }
    }

    private func complete(_ result: Result<Data?, Error>) {
        guard !finished else { return }
        finished = true
        engine.stop()
        onFinish?(result)
    }
}

// Session operations stay on a serial queue, including configuration, start, stop, and shutter.
private final class QuestionCameraSession: NSObject, AVCapturePhotoCaptureDelegate {
    let session = AVCaptureSession()
    private let output = AVCapturePhotoOutput()
    private let queue = DispatchQueue(label: "qingyan.question-camera", qos: .userInitiated)
    private var configured = false
    private var completion: ((Result<UIImage, Error>) -> Void)?

    func start(completion: @escaping (Result<Void, Error>) -> Void) {
        queue.async {
            let result = Result {
                if !self.configured { try self.configure() }
                if !self.session.isRunning { self.session.startRunning() }
                guard self.session.isRunning else { throw StudyError("相机启动失败，请重试") }
            }
            DispatchQueue.main.async { completion(result) }
        }
    }

    private func configure() throws {
        session.beginConfiguration()
        defer { session.commitConfiguration() }
        session.sessionPreset = .photo
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
            throw StudyError("当前设备无法使用后置相机")
        }
        let input = try AVCaptureDeviceInput(device: device)
        guard session.canAddInput(input) else { throw StudyError("无法连接相机") }
        session.addInput(input)
        guard session.canAddOutput(output) else {
            session.removeInput(input)
            throw StudyError("无法拍摄照片")
        }
        session.addOutput(output)
        configured = true
    }

    func stop() {
        queue.async { if self.session.isRunning { self.session.stopRunning() } }
    }

    func capture(orientation: AVCaptureVideoOrientation, completion: @escaping (Result<UIImage, Error>) -> Void) {
        queue.async {
            guard self.completion == nil, self.session.isRunning else {
                DispatchQueue.main.async { completion(.failure(StudyError("相机暂时不可用，请重试"))) }
                return
            }
            self.completion = completion
            if let connection = self.output.connection(with: .video), connection.isVideoOrientationSupported {
                connection.videoOrientation = orientation
            }
            let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
            settings.photoQualityPrioritization = .balanced
            self.output.capturePhoto(with: settings, delegate: self)
        }
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        let data = photo.fileDataRepresentation()
        queue.async {
            let result = Result<UIImage, Error> {
                if let error { throw error }
                guard let data, let source = CGImageSourceCreateWithData(data as CFData, nil),
                      let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                        kCGImageSourceCreateThumbnailFromImageAlways: true,
                        kCGImageSourceCreateThumbnailWithTransform: true,
                        kCGImageSourceThumbnailMaxPixelSize: 2600,
                      ] as CFDictionary) else { throw StudyError("题图读取失败，请重拍") }
                return UIImage(cgImage: image)
            }
            self.finish(result)
        }
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishCaptureFor resolvedSettings: AVCaptureResolvedPhotoSettings, error: Error?) {
        if let error { queue.async { self.finish(.failure(error)) } }
    }

    private func finish(_ result: Result<UIImage, Error>) {
        let callback = completion
        completion = nil
        DispatchQueue.main.async { callback?(result) }
    }
}
