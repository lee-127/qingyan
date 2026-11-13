import AVFoundation
import ImageIO
import PhotosUI
import UIKit
import UniformTypeIdentifiers

@MainActor
final class QuestionPhotoPicker: NSObject, PHPickerViewControllerDelegate {
    enum Source: String {
        case camera, library
    }

    private var completion: ((Result<Data?, Error>) -> Void)?
    private weak var host: UIViewController?

    func present(_ source: Source, from host: UIViewController,
                 completion: @escaping (Result<Data?, Error>) -> Void) throws {
        guard self.completion == nil else { throw StudyError("请先完成当前题图选择") }
        self.host = host
        switch source {
        case .camera:
            guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
                throw StudyError("当前设备无法使用相机，请从相册选择题图")
            }
            let access = AVCaptureDevice.authorizationStatus(for: .video)
            guard access != .denied, access != .restricted else {
                throw StudyError("请在系统设置中允许清研访问相机，或从相册选择题图")
            }
            self.completion = completion
            showEditor()
        case .library:
            var configuration = PHPickerConfiguration()
            configuration.selectionLimit = 1
            configuration.filter = .images
            configuration.preferredAssetRepresentationMode = .current
            let picker = PHPickerViewController(configuration: configuration)
            picker.isModalInPresentation = true
            picker.delegate = self
            self.completion = completion
            host.present(picker, animated: true)
        }
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true) {
            guard let item = results.first?.itemProvider else {
                self.finish(.success(nil))
                return
            }
            item.loadFileRepresentation(forTypeIdentifier: UTType.image.identifier) { url, _ in
                let result = Result { try Self.readPhoto(url) }
                Task { @MainActor in
                    switch result {
                    case .success(let image): self.showEditor(image)
                    case .failure(let error): self.finish(.failure(error))
                    }
                }
            }
        }
    }

    private func showEditor(_ photo: UIImage? = nil) {
        guard let host else { finish(.failure(StudyError("无法打开选题窗口，请重试"))); return }
        let controller = QuestionCameraController(photo: photo)
        controller.onFinish = { [weak self, weak controller] result in
            controller?.dismiss(animated: true) { self?.finish(result) }
        }
        host.present(controller, animated: true)
    }

    private func finish(_ result: Result<Data?, Error>) {
        let callback = completion
        completion = nil
        host = nil
        callback?(result)
    }

    private nonisolated static func readPhoto(_ url: URL?) throws -> UIImage {
        guard let url, let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: 2400,
              ] as CFDictionary) else {
            throw StudyError("无法读取这张照片，请重新选择")
        }
        return UIImage(cgImage: image)
    }
}
