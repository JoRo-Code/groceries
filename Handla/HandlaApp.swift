import SwiftUI
import FirebaseCore
import FirebaseAuth
import FirebaseFirestore

@main
struct HandlaApp: App {
    @UIApplicationDelegateAdaptor(AppNotificationDelegate.self) private var notificationDelegate
    @StateObject private var store: Store
    @AppStorage("appearance") private var appearance = AppAppearance.system.rawValue
    init() {
        var configured = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--qa-deletion-emulator") {
            let options = FirebaseOptions(googleAppID: "1:123456789:ios:abcdef0123456789", gcmSenderID: "123456789")
            options.apiKey = "A" + String(repeating: "0", count: 38); options.projectID = "demo-handla"
            FirebaseApp.configure(options: options)
            Auth.auth().useEmulator(withHost: "127.0.0.1", port: 9099)
            let firestore = Firestore.firestore()
            firestore.useEmulator(withHost: "127.0.0.1", port: 8185)
            let settings = firestore.settings
            settings.isSSLEnabled = false
            settings.cacheSettings = MemoryCacheSettings()
            firestore.settings = settings
            configured = true
        } else if configured { FirebaseApp.configure() }
        #else
        if configured { FirebaseApp.configure() }
        #endif
        _store = StateObject(wrappedValue: Store(configured: configured))
    }
    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(store).tint(.indigo)
                .onOpenURL { store.receive($0) }
                .task {
                    PushNotifications.shared.start(store: store)
                    #if DEBUG
                    if ProcessInfo.processInfo.arguments.contains("--qa-deletion-emulator") { await NativeDeletionQA.run(store: store) }
                    #endif
                }
                .background(WindowAppearance(appearance: AppAppearance(rawValue: appearance) ?? .system))
        }
    }
}

// A local device preference; System follows iOS, including scheduled appearance changes.
enum AppAppearance: String, CaseIterable {
    case system, light, dark
    var title: String { switch self { case .system: "System"; case .light: "Ljust"; case .dark: "Mörkt" } }
}

// Apply at the window so an already-presented sheet also returns to the OS appearance.
private struct WindowAppearance: UIViewRepresentable {
    let appearance: AppAppearance
    func makeUIView(context: Context) -> AppearanceView { AppearanceView() }
    func updateUIView(_ view: AppearanceView, context: Context) {
        view.style = appearance == .system ? .unspecified : appearance == .dark ? .dark : .light
        view.apply()
    }
    final class AppearanceView: UIView {
        var style: UIUserInterfaceStyle = .unspecified
        override func didMoveToWindow() { super.didMoveToWindow(); apply() }
        func apply() { if window?.overrideUserInterfaceStyle != style { window?.overrideUserInterfaceStyle = style } }
    }
}
