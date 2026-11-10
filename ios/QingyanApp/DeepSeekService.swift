import Foundation
import Security

final class DeepSeekService: NSObject, URLSessionTaskDelegate {
    private let keyQuery: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "com.qingyan.personalstudy.deepseek",
        kSecAttrAccount as String: "api-key"
    ]

    private func key() throws -> String? {
        var query = keyQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data,
              let key = String(data: data, encoding: .utf8) else {
            throw StudyError("无法读取本机钥匙串，请解锁设备后重试")
        }
        return key
    }

    func configured() throws -> Bool { try key() != nil }

    func setKey(_ value: String) throws {
        let key = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if key.isEmpty {
            let status = SecItemDelete(keyQuery as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else {
                throw StudyError("无法从钥匙串移除 API Key")
            }
            return
        }
        guard key.count <= 512, !key.contains(where: \.isWhitespace) else {
            throw StudyError("API Key 格式不正确")
        }
        let data = Data(key.utf8)
        var status = SecItemUpdate(keyQuery as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            var item = keyQuery
            item[kSecValueData as String] = data
            item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            status = SecItemAdd(item as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw StudyError("无法将 API Key 存入本机钥匙串") }
    }

    func solve(question: String, image: String?, previous: String? = nil, variant: Bool = false) async throws -> [String: Any] {
        guard let key = try key() else { throw StudyError("请先在数据与设置中配置 DeepSeek API Key") }
        let question = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard question.count <= 20000, !question.isEmpty || image != nil else {
            throw StudyError("请输入题干或选择题图，题干最多 20000 字")
        }
        guard (previous?.count ?? 0) <= 120000 else {
            throw StudyError("解析已很长，请按小问分别解答")
        }
        let model = image == nil ? "deepseek-v4-pro" : "deepseek-flash"
        var userContent: Any = question
        if let image = image {
            let prefix = "data:image/jpeg;base64,"
            guard image.hasPrefix(prefix), image.utf8.count <= 7 * 1024 * 1024,
                  Data(base64Encoded: String(image.dropFirst(prefix.count)))?.isEmpty == false else {
                throw StudyError("题图内容无效或过大，请重新裁剪")
            }
            userContent = [
                ["type": "text", "text": question.isEmpty ? "请解答这张图中的题目。" : question],
                ["type": "image_url", "image_url": ["url": image]]
            ] as [[String: Any]]
        }
        let system = variant
            ? "你是考研命题老师。参考题干或题图，生成一道考查相同知识点、题型和难度的原创变式题。改变条件或设问，提供独立完整的题干，图形或表格所需的数据用文字给出。验算答案。仅输出 JSON 对象，包含非空字符串 question（可独立作答的题干）和 solution（关键步骤与最终答案）。两字段支持 Markdown 和 LaTeX。"
            : "你是考研辅导老师。用中文按 Markdown 小标题「考点」「解题步骤」「答案」组织解析。步骤按顺序编号，说明关键推导，末尾单独写最终结果。避免重复题干。使用 LaTeX 公式，行内用 \\(...\\)，独立公式用 \\[...\\]。条件不足或题图无法读清时说明缺失内容，不要猜测。"
        var messages: [[String: Any]] = [
            ["role": "system", "content": system],
            ["role": "user", "content": userContent]
        ]
        if let previous, !previous.isEmpty {
            messages.append(["role": "assistant", "content": previous])
            messages.append(["role": "user", "content": "接着上面已完成的段落继续解题。只写余下步骤和最终答案，从一个新段落开始，保持原步骤编号，不要重复上文。"])
        }
        var request = URLRequest(url: URL(string: "https://api.deepseek.com/chat/completions")!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var body: [String: Any] = [
            "model": model, "messages": messages, "stream": false,
            "max_tokens": variant ? 12288 : 24576
        ]
        if variant {
            body["response_format"] = ["type": "json_object"]
            body["reasoning_effort"] = "low"
        } else if previous == "" {
            body["reasoning_effort"] = "low"
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 210
        configuration.timeoutIntervalForResource = 360
        let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
        defer { session.finishTasksAndInvalidate() }
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw StudyError("DeepSeek 返回了无法识别的响应") }
        switch response.statusCode {
        case 200: break
        case 401, 403: throw StudyError("DeepSeek 未接受此 API Key，请检查密钥和模型权限")
        case 402: throw StudyError("DeepSeek 账户余额不足")
        case 429: throw StudyError("DeepSeek 请求过于频繁，请稍后重试")
        default: throw StudyError("DeepSeek 请求未完成（HTTP \(response.statusCode)）")
        }
        guard let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let choices = payload["choices"] as? [[String: Any]], let choice = choices.first,
              let message = choice["message"] as? [String: Any] else {
            throw StudyError("DeepSeek 没有返回完整解析，请重试或缩短题目")
        }
        let answer = (message["content"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let truncated = choice["finish_reason"] as? String == "length"
        let usedModel = payload["model"] as? String ?? model
        if variant {
            guard !truncated,
                  let fields = (try? JSONSerialization.jsonObject(with: Data(answer.utf8))) as? [String: String],
                  let problem = fields["question"]?.trimmingCharacters(in: .whitespacesAndNewlines), !problem.isEmpty,
                  let solution = fields["solution"]?.trimmingCharacters(in: .whitespacesAndNewlines), !solution.isEmpty else {
                throw StudyError("变式题未生成完整，请重新生成")
            }
            return ["question": problem, "solution": solution, "model": usedModel]
        }
        guard truncated || !answer.isEmpty else { throw StudyError("DeepSeek 未返回解析，请重试") }
        return ["answer": answer, "model": usedModel, "truncated": truncated]
    }

    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
