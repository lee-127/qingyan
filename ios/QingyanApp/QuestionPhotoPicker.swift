import AVFoundation
import ImageIO
import PhotosUI
import UIKit
import UniformTypeIdentifiers

@MainActor
final class QuestionPhotoPicker: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate, PHPickerViewControllerDelegate {
    enum Source: String {
        case camera, library
    }

    private var completion: ((Result<Data?, Error>) -> Void)?

    func present(_ source: Source, from host: UIViewController,
                 completion: @escaping (Result<Data?, Error>) -> Void) throws {
        guard self.completion == nil else { throw StudyError("请先完成当前题图选择") }
        switch source {
        case .camera:
            guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
                throw StudyError("当前设备无法使用相机，请从相册选择题图")
            }
            let access = AVCaptureDevice.authorizationStatus(for: .video)
            guard access != .denied, access != .restricted else {
                throw StudyError("请在系统设置中允许清研访问相机，或从相册选择题图")
            }
            let picker = UIImagePickerController()
            picker.sourceType = .camera
            picker.modalPresentationStyle = .fullScreen
            picker.delegate = self
            self.completion = completion
            host.present(picker, animated: true)
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

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        picker.dismiss(animated: true) { self.finish(.success(nil)) }
    }

    func imagePickerController(_ picker: UIImagePickerController,
                               didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        let photo = info[.originalImage] as? UIImage
        picker.dismiss(animated: true) {
            self.finish(Result { try Self.encode(photo) })
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
                Task { @MainActor in self.finish(result) }
            }
        }
    }

    private func finish(_ result: Result<Data?, Error>) {
        let callback = completion
        completion = nil
        callback?(result)
    }

    private nonisolated static func readPhoto(_ url: URL?) throws -> Data? {
        guard let url, let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: 2400,
              ] as CFDictionary) else {
            throw StudyError("无法读取这张照片，请重新选择")
        }
        return try encode(UIImage(cgImage: image))
    }

    private nonisolated static func encode(_ photo: UIImage?) throws -> Data? {
        guard let photo,
              let data = ScanProcessor.resized(photo, limit: 2400).jpegData(compressionQuality: 0.92) else {
            throw StudyError("无法处理题图，请重新拍照或选图")
        }
        return data
    }
}
