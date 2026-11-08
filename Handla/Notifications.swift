import SwiftUI
import UIKit
import UserNotifications
import FirebaseCore
import FirebaseAuth
import FirebaseFirestore
import FirebaseMessaging
import Combine

struct NotificationListRoute: Identifiable, Equatable {
    let id: String
    let recipientUID: String
    let workspaceID: String
    let listID: String
    static func parse(_ data: [AnyHashable: Any]) -> NotificationListRoute? {
        guard let event = data["eventID"] as? String, !event.isEmpty, event.count <= 512,
              let type = data["type"] as? String, ["itemAdded", "itemChecked"].contains(type),
              let user = data["recipientUID"] as? String,
              let workspace = data["workspaceID"] as? String,
              let list = data["listID"] as? String,
              [user, workspace, list].allSatisfy({ !$0.isEmpty && $0.count <= 128 && !$0.contains("/") }) else { return nil }
        return NotificationListRoute(id: event, recipientUID: user, workspaceID: workspace, listID: list)
    }
}

final class AppNotificationDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { @MainActor in
            guard PushNotifications.shared.available else { return }
            Messaging.messaging().apnsToken = deviceToken
            await PushNotifications.shared.refreshToken()
        }
    }
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        Task { @MainActor in PushNotifications.shared.message = "Enheten kunde inte registreras för notiser. Försök igen senare." }
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        Task { @MainActor in
            let allowed = PushNotifications.shared.shouldPresent(notification.request.content.userInfo)
            completionHandler(allowed ? [.banner, .sound] : [])
        }
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let data = response.notification.request.content.userInfo
        Task { @MainActor in await PushNotifications.shared.open(data) }
        completionHandler()
    }
}

@MainActor
final class PushNotifications: NSObject, ObservableObject, MessagingDelegate {
    static let shared = PushNotifications()
    @Published private(set) var enabled = false
    @Published private(set) var working = false
    @Published var message: String?
    @Published private(set) var denied = false
    private weak var store: Store?
    private var authListener: AuthStateDidChangeListenerHandle?
    private var observers = Set<AnyCancellable>()
    private var userID: String?
    private var generation = 0
    private var suspended = false
    private var token: String?
    private var pendingRoute: NotificationListRoute?
    private var routing = false
    private var handledEvent: String?
    #if DEBUG
    var validatedEventForQA: String? { handledEvent }
    #endif
    private var installationID: String {
        if let id = UserDefaults.standard.string(forKey: "pushInstallationID") { return id }
        let id = UUID().uuidString.lowercased()
        UserDefaults.standard.set(id, forKey: "pushInstallationID")
        return id
    }
    var available: Bool {
        FirebaseApp.app() != nil && Bundle.main.object(forInfoDictionaryKey: "HandlaPushEnabled") as? Bool == true
            && FirebaseApp.app()?.options.projectID != "demo-handla"
    }
    func start(store: Store) {
        self.store = store
        guard available, authListener == nil else { return }
        Messaging.messaging().delegate = self
        authListener = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in await self?.changedUser(user?.uid) }
        }
        store.$loading.combineLatest(store.$workspaceID).sink { [weak self] _ in
            Task { @MainActor in await self?.routePending() }
        }.store(in: &observers)
    }
    private func changedUser(_ id: String?) async {
        guard userID != id else { await routePending(); return }
        let previous = userID
        generation += 1; let current = generation
        userID = id; suspended = true; token = nil; message = nil
        if previous != nil {
            UIApplication.shared.unregisterForRemoteNotifications()
            UNUserNotificationCenter.current().removeAllDeliveredNotifications()
            Messaging.messaging().isAutoInitEnabled = false
            try? await Messaging.messaging().deleteToken()
        }
        guard current == generation, Auth.auth().currentUser?.uid == id else { return }
        suspended = false
        enabled = id.map { UserDefaults.standard.bool(forKey: "pushEnabled-\($0)") } ?? false
        if let pendingRoute, let id, pendingRoute.recipientUID != id { self.pendingRoute = nil }
        await refreshPermission()
        await routePending()
    }
    func refreshPermission() async {
        guard available else { return }
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        denied = settings.authorizationStatus == .denied
        if denied, enabled { try? await unregisterCurrentDevice(); enabled = false }
        guard enabled, userID != nil, !suspended,
              [.authorized, .provisional, .ephemeral].contains(settings.authorizationStatus) else { return }
        Messaging.messaging().isAutoInitEnabled = true
        UIApplication.shared.registerForRemoteNotifications()
    }
    func setEnabled(_ value: Bool) async {
        guard available, !working, let id = Auth.auth().currentUser?.uid else { return }
        working = true; message = nil
        defer { working = false }
        do {
            if value {
                let permitted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
                guard Auth.auth().currentUser?.uid == id else { return }
                denied = !permitted
                guard permitted else { message = "Notiser är avstängda i iPhone-inställningarna."; return }
                UserDefaults.standard.set(true, forKey: "pushEnabled-\(id)")
                enabled = true; suspended = false
                await refreshPermission()
            } else {
                try await unregisterCurrentDevice()
                UserDefaults.standard.set(false, forKey: "pushEnabled-\(id)"); enabled = false
            }
        } catch { message = "Inställningen kunde inte sparas. Kontrollera internetanslutningen och försök igen." }
    }
    nonisolated func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        Task { @MainActor [weak self] in await self?.saveToken(fcmToken) }
    }
    func refreshToken() async {
        guard available, enabled, !suspended else { return }
        do { await saveToken(try await Messaging.messaging().token()) }
        catch { message = "Notiser kunde inte aktiveras på enheten. Försök igen senare." }
    }
    private func saveToken(_ value: String?) async {
        guard available, enabled, !suspended, let value, let id = userID,
              Auth.auth().currentUser?.uid == id else { return }
        let current = generation
        token = value
        do {
            let settings = await UNUserNotificationCenter.current().notificationSettings()
            guard current == generation, enabled, !suspended,
                  [.authorized, .provisional, .ephemeral].contains(settings.authorizationStatus) else { return }
            try await Firestore.firestore().collection("users").document(id).collection("devices").document(installationID)
                .setData(["token": value, "platform": "ios", "updatedAt": FieldValue.serverTimestamp()])
            if current == generation { message = nil }
        } catch { if current == generation { message = "Enheten kunde inte sparas för notiser. Kontrollera anslutningen och försök igen." } }
    }
    private func unregisterCurrentDevice() async throws {
        guard FirebaseApp.app() != nil, let id = Auth.auth().currentUser?.uid else { return }
        suspended = true; generation += 1
        do {
            if UserDefaults.standard.bool(forKey: "pushEnabled-\(id)") || token != nil {
                _ = try await Firestore.firestore().collection("users").document(id).getDocument(source: .server)
                try await Firestore.firestore().collection("users").document(id).collection("devices").document(installationID).delete()
            }
        } catch { suspended = false; throw error }
        token = nil
        UIApplication.shared.unregisterForRemoteNotifications()
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
        UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
        if available { Messaging.messaging().isAutoInitEnabled = false; try? await Messaging.messaging().deleteToken() }
    }
    func prepareForSignOut() async throws {
        try await unregisterCurrentDevice()
        pendingRoute = nil; handledEvent = nil
        store?.notificationRoute = nil
    }
    func prepareForAccountDeletion() async throws {
        try await prepareForSignOut()
        if let id = Auth.auth().currentUser?.uid { UserDefaults.standard.removeObject(forKey: "pushEnabled-\(id)") }
        enabled = false
    }
    func shouldPresent(_ data: [AnyHashable: Any]) -> Bool {
        guard available, enabled, !suspended, let route = NotificationListRoute.parse(data),
              route.recipientUID == Auth.auth().currentUser?.uid,
              route.workspaceID == store?.workspaceID else { return false }
        return true
    }
    func open(_ data: [AnyHashable: Any]) async {
        guard let route = NotificationListRoute.parse(data), route.id != handledEvent else { return }
        pendingRoute = route
        await routePending()
    }
    func routePending() async {
        guard !routing, let route = pendingRoute, let store, !store.loading,
              let id = Auth.auth().currentUser?.uid else { return }
        guard route.recipientUID == id else { pendingRoute = nil; return }
        routing = true
        defer {
            routing = false
            if let next = pendingRoute, next.id != route.id { Task { @MainActor [weak self] in await self?.routePending() } }
        }
        do {
            let db = Firestore.firestore()
            let profile = try await db.collection("users").document(id).getDocument(source: .server)
            guard profile.get("workspaceID") as? String == route.workspaceID else {
                if pendingRoute?.id == route.id { pendingRoute = nil }
                return
            }
            let workspace = db.collection("workspaces").document(route.workspaceID)
            let member = try await workspace.collection("members").document(id).getDocument(source: .server)
            let list = try await workspace.collection("lists").document(route.listID).getDocument(source: .server)
            guard pendingRoute?.id == route.id else { return }
            guard Auth.auth().currentUser?.uid == id, member.exists, list.exists, store.workspaceID == route.workspaceID else { pendingRoute = nil; return }
            store.notificationRoute = route
            pendingRoute = nil; handledEvent = route.id
        } catch {
            if Auth.auth().currentUser?.uid == id { message = "Listan kunde inte öppnas. Kontrollera anslutningen och tryck på notisen igen." }
        }
    }
}

struct NotificationSettingsView: View {
    @ObservedObject private var notifications = PushNotifications.shared
    var body: some View {
        Section("Notiser") {
            if notifications.available {
                Toggle("Notiser från hushållet", isOn: Binding(get: { notifications.enabled }, set: { enabled in Task { await notifications.setEnabled(enabled) } }))
                    .disabled(notifications.working)
                Text("Få en notis när någon annan lägger till eller bockar av en vara. Notisen visar inga namn eller varor.").font(.footnote).foregroundStyle(.secondary)
                if notifications.working { ProgressView("Sparar inställningen…") }
                if notifications.denied { Button("Öppna iPhone-inställningar") { if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) } } }
                if let message = notifications.message { Text(message).font(.footnote).foregroundStyle(.secondary) }
            }
        }.task { await notifications.refreshPermission() }
    }
}
