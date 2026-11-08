import SwiftUI
import FirebaseCore

@main
struct HandlaApp: App {
    @StateObject private var store: Store
    @AppStorage("appearance") private var appearance = AppAppearance.system.rawValue
    init() {
        let configured = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil
        if configured { FirebaseApp.configure() }
        _store = StateObject(wrappedValue: Store(configured: configured))
    }
    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(store).tint(.indigo)
                .onOpenURL { store.receive($0) }
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
