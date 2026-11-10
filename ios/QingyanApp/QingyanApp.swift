import SwiftUI
import UIKit

@main
struct QingyanApp: App {
    var body: some Scene {
        WindowGroup {
            if UIDevice.current.userInterfaceIdiom == .phone {
                AppScreen()
                    .ignoresSafeArea(.keyboard)
                    .background {
                        LinearGradient(
                            colors: [
                                Color(red: 0.96, green: 0.98, blue: 0.97),
                                Color(red: 0.93, green: 0.96, blue: 0.96)
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                        .ignoresSafeArea(.container)
                    }
                    .preferredColorScheme(.light)
            } else {
                AppScreen().ignoresSafeArea(.keyboard)
            }
        }
    }
}

struct AppScreen: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> AppHost { AppHost() }
    func updateUIViewController(_ uiViewController: AppHost, context: Context) {}
}
