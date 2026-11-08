import SwiftUI
import FirebaseCore

@main
struct HandlaApp: App {
    @StateObject private var store: Store
    init() {
        let configured = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil
        if configured { FirebaseApp.configure() }
        _store = StateObject(wrappedValue: Store(configured: configured))
    }
    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(store).tint(.indigo)
                .onOpenURL { store.receive($0) }
        }
    }
}
