# 清研 iPhone／iPad 开发指南

清研原生 App 使用 SwiftUI 和 WKWebView，复用仓库中的 React 界面。随 App 打包的界面和本地资料可离线使用。扫描、文件选择和预览由系统提供。AI 功能使用你在 App 中配置的 DeepSeek API Key。

## 编译与运行

准备 macOS、Xcode 27、XcodeGen 和 Node.js 24。从仓库根目录执行：

~~~sh
npm ci
node ios/build-web.mjs
cd ios
xcodegen generate --spec project.yml
open Qingyan.xcodeproj
~~~

使用 Xcode 的 Qingyan scheme 运行模拟器。真机运行时，在 Qingyan target 的 Signing & Capabilities 中选择自己的团队，按需设置唯一的 Bundle Identifier。签名凭据由 Xcode 或本机签名工具管理。

在没有 Mac 的情况下，可以用 GitHub Actions 的 Apple 运行器编译。仓库中的 **ios/workflows/build-private-ipa.yml** 是私有编译仓库的模板。运行 **node ios/package.mjs** 会生成仅包含构建源码的 ZIP。将 ZIP 解压至自己的私有构建仓库，按 GitHub Actions 界面提示检查额度后手动触发。产物是待签名的 IPA。Windows 的签名安装流程见 [Sideloadly 安装说明](../docs/清研Sideloadly安装.md)。

## 使用与存储

- 在资料表单中点「智能扫描 PDF」，拍摄或导入多页，调整纸张四角、阴影和清晰度后生成 PDF。
- 在「数据与设置 → DeepSeek 解题」配置自己的 API Key。拍照搜题和错题变式练习使用该配置。
- 在「数据与设置 → iCloud 文件同步」选择自己的 iCloud 文件夹。Windows 与 iOS 可以交换同一种 ZIP 同步包。
- 使用 Xcode 运行 **QingyanTests** 和 **QingyanUITests**。测试使用临时文件与合成题图。

AppHost.swift 负责原生桥接，FileStore.swift 负责设备缓存与文件同步，ScanProcessor.swift 负责图片校正及 PDF 生成。
