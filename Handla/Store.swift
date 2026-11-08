import Foundation
import Combine
import CryptoKit
import AuthenticationServices
import FirebaseAuth
import FirebaseCore
import FirebaseFirestore

struct HouseholdMember: Identifiable {
    let id: String
    let role: String
    let displayName: String?
    let isCurrentUser: Bool
    var name: String { displayName?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? displayName! : "Namnlös medlem" }
    var initials: String {
        guard let displayName, !displayName.isEmpty else { return "?" }
        let parts = displayName.split(separator: "@", maxSplits: 1).first?.split(separator: " ") ?? []
        return parts.prefix(2).compactMap { $0.first.map(String.init) }.joined().uppercased()
    }
}
struct ShoppingList: Identifiable {
    let id: String
    let name: String
    let lastChangedAt: Date?
    init(id: String, name: String, lastChangedAt: Date? = nil) { self.id = id; self.name = name; self.lastChangedAt = lastChangedAt }
}
struct Grocery: Identifiable {
    let id: String
    let name: String
    let quantity: String
    let checked: Bool
    let category: GroceryCategory
    let createdAt: Date?
    let checkedAt: Date?
    let createdByUID: String?
    let updatedByUID: String?
    let updatedAt: Date?

    init(id: String, name: String, quantity: String, checked: Bool, category: GroceryCategory = .other, createdAt: Date? = nil, checkedAt: Date? = nil, createdByUID: String? = nil, updatedByUID: String? = nil, updatedAt: Date? = nil) {
        self.id = id; self.name = name; self.quantity = quantity; self.checked = checked; self.category = category
        self.createdAt = createdAt; self.checkedAt = checkedAt
        self.createdByUID = createdByUID; self.updatedByUID = updatedByUID; self.updatedAt = updatedAt
    }
}
struct Invitation: Identifiable { let id: String; let workspaceID: String; let name: String }
enum HandlaError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let text) = self { return text }; return nil }
}

@MainActor
final class Store: ObservableObject {
    let configured: Bool
    @Published var signedIn = false
    @Published private(set) var sessionID = UUID()
    @Published var memberCount = 0
    @Published var members: [HouseholdMember] = []
    @Published private(set) var membersReady = false
    @Published private(set) var membersFailed = false
    private var attemptedIdentityFill = false
    @Published var listsPending = false
    @Published var loading = false
    @Published var busy = false
    @Published private(set) var deletingAccount = false
    @Published var error: String?
    @Published var workspaceID: String?
    @Published var workspaceName = ""
    @Published var owner = false
    @Published var lists: [ShoppingList] = []
    @Published var suggestions: [GrocerySuggestion] = GroceryCatalog.builtIn
    @Published var invitation: Invitation?
    @Published var inviteURL: URL?
    @Published var lastViewedListID: String?
    @Published private(set) var startupSelectionReady = false
    private(set) var startupPreferredListID: String?
    private var startupProfileReady = false
    private var startupListsReady = false
    @Published var notificationRoute: NotificationListRoute?
    private var nonce = ""
    private var currentUserID: String?
    private var sessionGeneration = 0
    private var loadingInviteToken: String?
    private var authListener: AuthStateDidChangeListenerHandle?
    private var listeners: [ListenerRegistration] = []
    private var profileListener: ListenerRegistration?
    private var db: Firestore { Firestore.firestore() }
    var inviteHost: String { Bundle.main.object(forInfoDictionaryKey: "InviteHost") as? String ?? "" }
    private var uid: String { get throws {
        guard let uid = Auth.auth().currentUser?.uid else { throw HandlaError.message("Logga in först.") }
        return uid
    } }
    init(configured: Bool) {
        self.configured = configured
        guard configured else { return }
        loading = true
        authListener = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor [weak self] in
                guard let self else { return }
                let userID = user?.uid
                // Token refreshes must not tear down the current navigation or cached list.
                if self.signedIn, self.currentUserID == userID { return }
                self.sessionGeneration += 1
                let generation = self.sessionGeneration
                self.currentUserID = userID
                self.sessionID = UUID()
                self.profileListener?.remove()
                self.profileListener = nil
                self.resetWorkspace()
                self.invitation = nil
                self.loadingInviteToken = nil
                self.error = nil
                self.signedIn = user != nil
                guard let user else { self.loading = false; return }
                self.loading = true
                self.profileListener = self.db.collection("users").document(user.uid).addSnapshotListener(includeMetadataChanges: true) { [weak self] snapshot, error in
                    Task { @MainActor [weak self] in
                        guard let self, self.sessionGeneration == generation, !self.deletingAccount else { return }
                        if let error { self.loading = false; self.error = error.localizedDescription; return }
                        // An empty local cache does not prove this is a new account.
                        guard let snapshot else { return }
                        // Local profile creation precedes server membership authorization.
                        // Start shared-data listeners only after the atomic batch is acknowledged.
                        guard !snapshot.metadata.hasPendingWrites else { return }
                        if let id = snapshot.get("workspaceID") as? String {
                            self.watchWorkspace(id)
                            self.lastViewedListID = snapshot.get("lastViewedListID") as? String
                            if !snapshot.metadata.isFromCache, !self.startupProfileReady {
                                self.startupPreferredListID = self.lastViewedListID
                                self.startupProfileReady = true
                                self.startupSelectionReady = self.startupListsReady
                            }
                            self.loading = false
                        } else if !snapshot.metadata.isFromCache {
                            self.resetWorkspace()
                            self.loading = false
                        }
                        if !self.loading { await self.loadPendingInvite() }
                    }
                }
            }
        }
    }
    func perform(_ action: @escaping () async throws -> Void) {
        guard !busy else { return }
        busy = true
        error = nil
        let generation = sessionGeneration
        Task {
            defer { busy = false }
            do { try await action() }
            catch { if sessionGeneration == generation { self.error = error.localizedDescription } }
        }
    }
    func authenticate(email: String, password: String, creatingAccount: Bool) async throws {
        let email = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard email.contains("@"), !password.isEmpty else {
            throw HandlaError.message("Ange din e-postadress och ditt lösenord.")
        }
        if creatingAccount, password.count < 6 {
            throw HandlaError.message("Välj ett lösenord med minst 6 tecken.")
        }
        do {
            if creatingAccount { _ = try await Auth.auth().createUser(withEmail: email, password: password) }
            else { _ = try await Auth.auth().signIn(withEmail: email, password: password) }
        } catch { throw emailAuthenticationError(error) }
    }
    func sendPasswordReset(email: String) async throws {
        let email = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard email.contains("@") else { throw HandlaError.message("Ange din e-postadress först.") }
        do { try await Auth.auth().sendPasswordReset(withEmail: email) }
        catch { throw emailAuthenticationError(error) }
    }
    private func emailAuthenticationError(_ error: Error) -> Error {
        let failure = error as NSError
        guard failure.domain == AuthErrorDomain else { return error }
        switch AuthErrorCode(rawValue: failure.code) {
        case .invalidEmail: return HandlaError.message("Kontrollera e-postadressen och försök igen.")
        case .emailAlreadyInUse: return HandlaError.message("E-postadressen har redan ett konto. Välj Logga in eller återställ lösenordet.")
        case .weakPassword: return HandlaError.message("Lösenordet uppfyller inte kraven. Välj ett starkare lösenord med minst 6 tecken.")
        case .userMismatch: return HandlaError.message("Använd samma konto som du är inloggad med.")
        case .requiresRecentLogin: return HandlaError.message("Bekräfta din inloggning igen och försök på nytt.")
        case .wrongPassword, .invalidCredential, .userNotFound: return HandlaError.message("Kunde inte logga in. Kontrollera e-postadress och lösenord.")
        case .networkError: return HandlaError.message("Kontrollera internetanslutningen och försök igen.")
        case .tooManyRequests: return HandlaError.message("För många försök. Vänta en stund och försök igen.")
        case .operationNotAllowed: return HandlaError.message("Den här inloggningsmetoden är inte aktiverad ännu.")
        default: return error
        }
    }
    func prepareApple(_ request: ASAuthorizationAppleIDRequest) {
        nonce = UUID().uuidString + UUID().uuidString
        request.requestedScopes = [.fullName]
        request.nonce = SHA256.hash(data: Data(nonce.utf8)).map { String(format: "%02x", $0) }.joined()
    }
    func finishApple(_ result: Result<ASAuthorization, Error>) {
        if case .failure(let error) = result,
           (error as? ASAuthorizationError)?.code == .canceled { return }
        perform {
            let authorization = try result.get()
            guard let apple = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = apple.identityToken, let token = String(data: tokenData, encoding: .utf8) else {
                throw HandlaError.message("Kunde inte logga in med Apple. Försök igen.")
            }
            let credential = OAuthProvider.appleCredential(withIDToken: token, rawNonce: self.nonce, fullName: apple.fullName)
            _ = try await Auth.auth().signIn(with: credential)
        }
    }
    private func resetWorkspace() {
        listeners.forEach { $0.remove() }; listeners = []
        workspaceID = nil; workspaceName = ""; lists = []; suggestions = GroceryCatalog.builtIn; owner = false; inviteURL = nil
        notificationRoute = nil; lastViewedListID = nil
        startupSelectionReady = false; startupPreferredListID = nil; startupProfileReady = false; startupListsReady = false
        memberCount = 0; members = []; membersReady = false; membersFailed = false; attemptedIdentityFill = false; listsPending = false
    }
    private func watchWorkspace(_ id: String) {
        guard workspaceID != id else { return }
        resetWorkspace(); workspaceID = id
        let generation = sessionGeneration
        let ref = db.collection("workspaces").document(id)
        listeners.append(ref.addSnapshotListener { snapshot, error in
            Task { @MainActor in
                guard self.sessionGeneration == generation, self.workspaceID == id else { return }
                if let error { self.error = error.localizedDescription; return }
                self.workspaceName = snapshot?.get("name") as? String ?? "Hushållet"
                self.owner = snapshot?.get("ownerID") as? String == Auth.auth().currentUser?.uid
                if self.owner, let token = snapshot?.get("inviteToken") as? String {
                    self.inviteURL = URL(string: "https://\(self.inviteHost)/join/\(token)")
                } else { self.inviteURL = nil }
            }
        })
        listeners.append(ref.collection("lists").addSnapshotListener(includeMetadataChanges: true) { snapshot, error in
            Task { @MainActor in
                guard self.sessionGeneration == generation, self.workspaceID == id else { return }
                if let error { self.error = error.localizedDescription; return }
                self.listsPending = snapshot?.metadata.hasPendingWrites ?? false
                self.lists = (snapshot?.documents ?? []).map { ShoppingList(id: $0.documentID, name: $0.get("name") as? String ?? "Lista", lastChangedAt: ($0.data(with: .estimate)["lastChangedAt"] as? Timestamp)?.dateValue()) }.sorted {
                    let left = $0.lastChangedAt ?? .distantPast, right = $1.lastChangedAt ?? .distantPast
                    if left != right { return left > right }
                    let comparison = $0.name.localizedStandardCompare($1.name)
                    return comparison == .orderedSame ? $0.id < $1.id : comparison == .orderedAscending
                }
                if let snapshot, !snapshot.metadata.isFromCache, !snapshot.metadata.hasPendingWrites {
                    self.startupListsReady = true
                    self.startupSelectionReady = self.startupProfileReady
                }
            }
        })
        listeners.append(ref.collection("products").addSnapshotListener { snapshot, error in
            Task { @MainActor in
                guard self.sessionGeneration == generation, self.workspaceID == id else { return }
                if let error { self.error = error.localizedDescription; return }
                let saved = (snapshot?.documents ?? []).compactMap { document -> GroceryCatalog.StoredProduct? in
                    guard let name = document.get("name") as? String else { return nil }
                    let category = (document.get("category") as? String).flatMap(GroceryCategory.init(rawValue:))
                    let canonicalID = SHA256.hash(data: Data(GroceryCatalog.normalized(name).utf8)).map { String(format: "%02x", $0) }.joined()
                    return GroceryCatalog.StoredProduct(name: name, category: category, isCanonical: document.documentID == canonicalID)
                }
                self.suggestions = GroceryCatalog.merged(custom: GroceryCatalog.workspaceProducts(saved))
            }
        })
        listeners.append(ref.collection("members").addSnapshotListener(includeMetadataChanges: true) { [weak self] snapshot, error in
            Task { @MainActor [weak self] in
                guard let self, self.sessionGeneration == generation, self.workspaceID == id else { return }
                if let error { self.membersFailed = true; self.error = error.localizedDescription; return }
                let documents = snapshot?.documents ?? []
                self.membersReady = snapshot?.metadata.isFromCache == false; self.membersFailed = false
                self.members = documents.map { document in
                    HouseholdMember(id: document.documentID, role: document.get("role") as? String ?? "member",
                        displayName: document.get("displayName") as? String, isCurrentUser: document.documentID == self.currentUserID)
                }.sorted { lhs, rhs in
                    if lhs.role != rhs.role { return lhs.role == "owner" }
                    return lhs.name.localizedStandardCompare(rhs.name) == .orderedAscending
                }
                self.memberCount = self.members.count
                if !self.attemptedIdentityFill, let identity = self.memberIdentity,
                   let own = documents.first(where: { $0.documentID == self.currentUserID }),
                   (own.get("displayName") as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false {
                    self.attemptedIdentityFill = true
                    own.reference.updateData(["displayName": identity]) { [weak self] error in
                        Task { @MainActor [weak self] in
                            guard let self, self.sessionGeneration == generation, self.workspaceID == id else { return }
                            if let error { self.error = error.localizedDescription }
                        }
                    }
                }
            }
        })
    }
    private var memberIdentity: String? {
        guard let user = Auth.auth().currentUser else { return nil }
        for candidate in [user.displayName, user.email] {
            if let name = candidate?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty { return String(name.prefix(160)) }
        }
        return nil
    }
    private func membershipData(role: String, inviteToken: String? = nil) -> [String: Any] {
        var data: [String: Any] = ["role": role]
        if let inviteToken { data["inviteToken"] = inviteToken }
        if let name = memberIdentity { data["displayName"] = name }
        return data
    }
    private func requireWorkspace() throws -> String {
        guard let workspaceID else { throw HandlaError.message("Öppna ett hushåll först.") }
        return workspaceID
    }
    func createWorkspace(_ name: String) async throws {
        let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name.count <= 80 else { throw HandlaError.message("Ange ett namn med högst 80 tecken.") }
        guard workspaceID == nil else { throw HandlaError.message("Du tillhör redan ett hushåll.") }
        let userID = try uid
        // Fail promptly offline rather than leaving onboarding waiting for a queued write.
        _ = try await db.collection("users").document(userID).getDocument(source: .server)
        let ref = db.collection("workspaces").document()
        let batch = db.batch()
        batch.setData(["name": name, "ownerID": userID], forDocument: ref)
        batch.setData(membershipData(role: "owner"), forDocument: ref.collection("members").document(userID))
        let firstList = ref.collection("lists").document()
        batch.setData(["workspaceID": ref.documentID, "lastViewedListID": firstList.documentID], forDocument: db.collection("users").document(userID))
        batch.setData(["name": "Veckohandling", "lastChangedAt": FieldValue.serverTimestamp()], forDocument: firstList)
        try await batch.commit()
    }
    func createInvite() async throws {
        guard let workspaceID, owner else { return }
        guard !inviteHost.isEmpty, !inviteHost.contains("your-project") else { throw HandlaError.message("Konfigurera appens inbjudningsdomän först.") }
        // One active reusable link per workspace. Rotating it revokes the old link atomically.
        let workspace = db.collection("workspaces").document(workspaceID)
        let snapshot = try await workspace.getDocument(source: .server)
        let token = UUID().uuidString.lowercased() + UUID().uuidString.lowercased()
        let batch = db.batch()
        if let old = snapshot.get("inviteToken") as? String { batch.deleteDocument(db.collection("invites").document(old)) }
        batch.setData(["workspaceID": workspaceID, "name": workspaceName,
                       "expiresAt": Timestamp(date: Date().addingTimeInterval(7 * 86400 - 60))], forDocument: db.collection("invites").document(token))
        batch.updateData(["inviteToken": token], forDocument: workspace)
        try await batch.commit()
        inviteURL = URL(string: "https://\(inviteHost)/join/\(token)")
    }
    func revokeInvite() async throws {
        guard let workspaceID, owner else { return }
        let ref = db.collection("workspaces").document(workspaceID)
        let snapshot = try await ref.getDocument(source: .server)
        let batch = db.batch()
        if let token = snapshot.get("inviteToken") as? String { batch.deleteDocument(db.collection("invites").document(token)) }
        batch.updateData(["inviteToken": FieldValue.delete()], forDocument: ref)
        try await batch.commit(); inviteURL = nil
    }
    func receive(_ url: URL) {
        let parts = url.pathComponents.filter { $0 != "/" }
        guard url.scheme == "https", url.host == inviteHost, parts.count == 2, parts[0] == "join",
              parts[1].range(of: "^[a-f0-9-]{72}$", options: .regularExpression) != nil else {
            error = "Det här är ingen giltig inbjudningslänk."; return
        }
        error = nil
        UserDefaults.standard.set(parts[1], forKey: "pendingInvite")
        guard configured, signedIn else { return }
        Task { await loadPendingInvite() }
    }
    func loadPendingInvite() async {
        guard configured, signedIn, !loading,
              let token = UserDefaults.standard.string(forKey: "pendingInvite"),
              invitation?.id != token, loadingInviteToken != token else { return }
        let generation = sessionGeneration
        loadingInviteToken = token
        defer { if loadingInviteToken == token { loadingInviteToken = nil } }
        do {
            let doc = try await db.collection("invites").document(token).getDocument(source: .server)
            guard sessionGeneration == generation,
                  UserDefaults.standard.string(forKey: "pendingInvite") == token else { return }
            guard let id = doc.get("workspaceID") as? String, let name = doc.get("name") as? String else { throw HandlaError.message("Inbjudan finns inte längre.") }
            invitation = Invitation(id: token, workspaceID: id, name: name)
        } catch {
            guard sessionGeneration == generation,
                  UserDefaults.standard.string(forKey: "pendingInvite") == token else { return }
            let failure = error as NSError
            let invalid = error is HandlaError || (failure.domain == FirestoreErrorDomain &&
                [FirestoreErrorCode.Code.permissionDenied.rawValue, FirestoreErrorCode.Code.notFound.rawValue].contains(failure.code))
            if invalid {
                UserDefaults.standard.removeObject(forKey: "pendingInvite")
                self.error = "Inbjudan har gått ut eller återkallats. Be hushållets ägare om en ny länk."
            } else {
                self.error = "Inbjudan kunde inte hämtas. Kontrollera nätet och öppna länken igen."
            }
        }
    }
    func dismissInvite() { invitation = nil; error = nil; UserDefaults.standard.removeObject(forKey: "pendingInvite") }
    func join(_ invite: Invitation) async throws {
        if workspaceID == invite.workspaceID { dismissInvite(); return }
        guard workspaceID == nil else { throw HandlaError.message("Du tillhör redan ett hushåll. Byte av hushåll stöds inte i den här versionen.") }
        let userID = try uid
        _ = try await db.collection("invites").document(invite.id).getDocument(source: .server)
        let batch = db.batch()
        batch.setData(membershipData(role: "member", inviteToken: invite.id), forDocument: db.collection("workspaces").document(invite.workspaceID).collection("members").document(userID))
        batch.setData(["workspaceID": invite.workspaceID], forDocument: db.collection("users").document(userID))
        try await batch.commit(); dismissInvite()
    }
    func addList(_ name: String) throws {
        let workspaceID = try requireWorkspace()
        let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name.count <= 80 else { throw HandlaError.message("Ange ett namn med högst 80 tecken.") }
        let list = db.collection("workspaces").document(workspaceID).collection("lists").document()
        let batch = db.batch()
        batch.setData(["name": name, "lastChangedAt": FieldValue.serverTimestamp()], forDocument: list)
        batch.updateData(["lastViewedListID": list.documentID], forDocument: db.collection("users").document(try uid))
        commitItemBatch(batch)
    }

    func renameList(_ id: String, name: String) throws {
        let workspaceID = try requireWorkspace()
        let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name.count <= 80 else { throw HandlaError.message("Ange ett namn med högst 80 tecken.") }
        let generation = sessionGeneration
        db.collection("workspaces").document(workspaceID).collection("lists").document(id).updateData(["name": name, "lastChangedAt": FieldValue.serverTimestamp()]) { [weak self] error in
            Task { @MainActor [weak self] in
                guard let self, self.sessionGeneration == generation else { return }
                if let error { self.error = error.localizedDescription }
            }
        }
    }
    func itemActorName(_ actorID: String?) -> String {
        guard let actorID else { return "Uppgift saknas" }
        if actorID == currentUserID { return "Du" }
        if membersFailed { return "Namnet kunde inte hämtas" }
        guard membersReady else { return "Hämtar namn…" }
        guard let member = members.first(where: { $0.id == actorID }) else { return "Tidigare medlem" }
        if member.isCurrentUser { return "Du" }
        let name = member.displayName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return name.isEmpty ? "Medlem utan namn" : name
    }
    private func itemAuditFields() throws -> [String: Any] {
        ["updatedByUID": try uid, "updatedAt": FieldValue.serverTimestamp()]
    }
    func itemsRef(_ listID: String) -> CollectionReference? {
        guard let workspaceID else { return nil }
        return db.collection("workspaces").document(workspaceID).collection("lists").document(listID).collection("items")
    }
    func addItem(_ name: String, quantity: String, category: GroceryCategory, listID: String) throws {
        let workspaceID = try requireWorkspace()
        guard let items = itemsRef(listID) else { throw HandlaError.message("Listan kunde inte öppnas.") }
        let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name.count <= 120, quantity.count <= 80 else { throw HandlaError.message("Ange ett varunamn på högst 120 tecken och en mängd på högst 80 tecken.") }
        let key = SHA256.hash(data: Data(GroceryCatalog.normalized(name).utf8)).map { String(format: "%02x", $0) }.joined()
        let batch = db.batch()
        var data: [String: Any] = ["name": name, "quantity": quantity.trimmingCharacters(in: .whitespacesAndNewlines), "checked": false, "category": category.rawValue, "createdAt": FieldValue.serverTimestamp(), "checkedAt": NSNull()]
        data["createdByUID"] = try uid
        data.merge(try itemAuditFields()) { _, new in new }
        if pushDataEnabled { data["lastActorUID"] = try uid; data["lastActionAt"] = FieldValue.serverTimestamp() }
        batch.setData(data, forDocument: items.document())
        batch.setData(["name": name, "category": category.rawValue], forDocument: db.collection("workspaces").document(workspaceID).collection("products").document(key))
        batch.updateData(["lastChangedAt": FieldValue.serverTimestamp()], forDocument: db.collection("workspaces").document(workspaceID).collection("lists").document(listID))
        let generation = sessionGeneration
        batch.commit { [weak self] error in
            Task { @MainActor [weak self] in
                guard let self, self.sessionGeneration == generation else { return }
                if let error { self.error = error.localizedDescription }
            }
        }
    }
    /// Field updates deliberately omit checked, preserving another shopper's check-off.
    func updateItem(_ id: String, name: String, quantity: String, category: GroceryCategory, listID: String) throws {
        let workspaceID = try requireWorkspace()
        guard let items = itemsRef(listID) else { throw HandlaError.message("Listan kunde inte öppnas.") }
        let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name.count <= 120, quantity.count <= 80 else { throw HandlaError.message("Ange ett varunamn på högst 120 tecken och en mängd på högst 80 tecken.") }
        let key = SHA256.hash(data: Data(GroceryCatalog.normalized(name).utf8)).map { String(format: "%02x", $0) }.joined()
        let batch = db.batch()
        var update: [String: Any] = ["name": name, "quantity": quantity.trimmingCharacters(in: .whitespacesAndNewlines), "category": category.rawValue]
        update.merge(try itemAuditFields()) { _, new in new }
        batch.updateData(update, forDocument: items.document(id))
        batch.setData(["name": name, "category": category.rawValue], forDocument: db.collection("workspaces").document(workspaceID).collection("products").document(key))
        batch.updateData(["lastChangedAt": FieldValue.serverTimestamp()], forDocument: db.collection("workspaces").document(workspaceID).collection("lists").document(listID))
        let generation = sessionGeneration
        batch.commit { [weak self] error in
            Task { @MainActor [weak self] in
                guard let self, self.sessionGeneration == generation else { return }
                if let error { self.error = error.localizedDescription }
            }
        }
    }
    private var pushDataEnabled: Bool {
#if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--qa-deletion-emulator"), ProcessInfo.processInfo.arguments.contains("--qa-push-data"), FirebaseApp.app()?.options.projectID == "demo-handla" { return true }
#endif
        return Bundle.main.object(forInfoDictionaryKey: "HandlaPushEnabled") as? Bool == true
    }
    func rememberViewedList(_ id: String) throws {
        _ = try requireWorkspace()
        let userID = try uid
        let generation = sessionGeneration
        db.collection("users").document(userID).updateData(["lastViewedListID": id]) { [weak self] error in
            Task { @MainActor [weak self] in guard let self, self.sessionGeneration == generation else { return }; if let error { self.error = error.localizedDescription } }
        }
    }
    func setItemChecked(_ id: String, checked: Bool, listID: String) throws {
        let workspaceID = try requireWorkspace()
        guard let items = itemsRef(listID) else { return }
        var update: [String: Any] = ["checked": checked]
        update.merge(try itemAuditFields()) { _, new in new }
        if pushDataEnabled { update["lastActorUID"] = try uid; update["lastActionAt"] = FieldValue.serverTimestamp() }
        if checked { update["checkedAt"] = FieldValue.serverTimestamp() }
        let batch = db.batch()
        batch.updateData(update, forDocument: items.document(id))
        batch.updateData(["lastChangedAt": FieldValue.serverTimestamp()], forDocument: db.collection("workspaces").document(workspaceID).collection("lists").document(listID))
        commitItemBatch(batch)
    }
    func deleteItem(_ id: String, listID: String) throws {
        let workspaceID = try requireWorkspace()
        guard let items = itemsRef(listID) else { return }
        let batch = db.batch()
        batch.deleteDocument(items.document(id))
        batch.updateData(["lastChangedAt": FieldValue.serverTimestamp()], forDocument: db.collection("workspaces").document(workspaceID).collection("lists").document(listID))
        commitItemBatch(batch)
    }
    private func commitItemBatch(_ batch: WriteBatch) {
        let generation = sessionGeneration
        batch.commit { [weak self] error in
            Task { @MainActor [weak self] in guard let self, self.sessionGeneration == generation else { return }; if let error { self.error = error.localizedDescription } }
        }
    }
    func signOut() async throws {
        do { try await PushNotifications.shared.prepareForSignOut() }
        catch { throw HandlaError.message("Kunde inte koppla från enhetens notiser. Kontrollera internetanslutningen och försök logga ut igen.") }
        try Auth.auth().signOut()
        sessionGeneration += 1
        sessionID = UUID()
        signedIn = false
        currentUserID = nil
        profileListener?.remove(); profileListener = nil
        resetWorkspace()
        invitation = nil
        loadingInviteToken = nil
        loading = false
    }
}

struct AccountDeletionPlan {
    let userID: String
    let workspaceID: String?
    let owner: Bool
    let successorID: String?
    let successorName: String?
    var explanation: String {
        guard workspaceID != nil else { return "Ditt konto och dina kontouppgifter raderas permanent." }
        if !owner { return "Ditt konto och ditt medlemskap raderas. Hushållets gemensamma listor finns kvar för de andra medlemmarna." }
        if let successorName { return "Ditt konto raderas och \(successorName) blir ägare. Hushållets gemensamma listor finns kvar. Tidigare inbjudningslänkar återkallas." }
        return "Du är ensam i hushållet. Ditt konto och hela hushållet, inklusive listor, varor och inköpshistorik, raderas permanent."
    }
}

extension Store {
    var deletionUsesApple: Bool { Auth.auth().currentUser?.providerData.contains { $0.providerID == "apple.com" } == true }
    var deletionUsesPassword: Bool { Auth.auth().currentUser?.providerData.contains { $0.providerID == "password" } == true }
    var accountEmail: String { Auth.auth().currentUser?.email ?? "" }

    func prepareAccountDeletion() async throws -> AccountDeletionPlan {
        let userID = try uid
        let profile = try await db.collection("users").document(userID).getDocument(source: .server)
        guard let workspaceID = profile.get("workspaceID") as? String else {
            return AccountDeletionPlan(userID: userID, workspaceID: nil, owner: false, successorID: nil, successorName: nil)
        }
        let workspace = db.collection("workspaces").document(workspaceID)
        let document = try await workspace.getDocument(source: .server)
        let isOwner = document.get("ownerID") as? String == userID
        let members = try await workspace.collection("members").getDocuments(source: .server)
        let successor = members.documents.filter { $0.documentID != userID }.sorted { $0.documentID < $1.documentID }.first
        return AccountDeletionPlan(userID: userID, workspaceID: workspaceID, owner: isOwner,
            successorID: isOwner ? successor?.documentID : nil,
            successorName: isOwner ? successor.map { ($0.get("displayName") as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "Medlem utan namn" } : nil)
    }

    func deleteAccount(plan: AccountDeletionPlan, password: String = "", appleAuthorization: ASAuthorization? = nil) async throws {
        guard let user = Auth.auth().currentUser, user.uid == plan.userID else { throw HandlaError.message("Kontot har ändrats. Öppna raderingen igen.") }
        guard !busy else { throw HandlaError.message("Vänta tills den pågående åtgärden är klar.") }
        busy = true; deletingAccount = true; error = nil
        defer { busy = false; deletingAccount = false; error = nil }
        do {
            // A server read fails offline before a destructive operation starts; drain existing writes first.
            _ = try await db.collection("users").document(user.uid).getDocument(source: .server)
            try await db.waitForPendingWrites()
            if deletionUsesApple {
                guard let apple = appleAuthorization?.credential as? ASAuthorizationAppleIDCredential,
                      let tokenData = apple.identityToken, let token = String(data: tokenData, encoding: .utf8),
                      let codeData = apple.authorizationCode, let code = String(data: codeData, encoding: .utf8) else {
                    throw HandlaError.message("Bekräfta ditt Apple-konto för att radera kontot.")
                }
                let credential = OAuthProvider.appleCredential(withIDToken: token, rawNonce: nonce, fullName: apple.fullName)
                _ = try await user.reauthenticate(with: credential)
                try await Auth.auth().revokeToken(withAuthorizationCode: code)
            } else if deletionUsesPassword, let email = user.email {
                guard !password.isEmpty else { throw HandlaError.message("Ange ditt lösenord för att bekräfta raderingen.") }
                _ = try await user.reauthenticate(with: EmailAuthProvider.credential(withEmail: email, password: password))
            } else {
                throw HandlaError.message("Kontots inloggningsmetod stöds inte av denna appversion. Raderingen har inte påbörjats.")
            }
            _ = try await user.getIDTokenResult(forcingRefresh: true)
            let profile = db.collection("users").document(user.uid)
            if pushDataEnabled, try await profile.getDocument(source: .server).exists { try await profile.updateData(["deletingAccount": true]) }
            try await PushNotifications.shared.prepareForAccountDeletion()
            try await removeAccountData(plan)
            // Auth is last: if it fails, the signed-in user can retry from onboarding without orphaned data.
            resetWorkspace()
            try await user.delete()
            UserDefaults.standard.removeObject(forKey: "pendingInvite")
            invitation = nil
        } catch {
            if let failure = error as? HandlaError { throw failure }
            if (error as NSError).domain == AuthErrorDomain { throw emailAuthenticationError(error) }
            throw HandlaError.message("Raderingen kunde inte slutföras. Kontrollera internetanslutningen och försök igen. Om raderingen redan har börjat fortsätter nästa försök där det avbröts.")
        }
    }

    private func removeAccountData(_ plan: AccountDeletionPlan) async throws {
        let userID = try uid
        guard userID == plan.userID else { throw HandlaError.message("Kontot har ändrats. Öppna raderingen igen.") }
        let profile = db.collection("users").document(userID)
        if pushDataEnabled { try await purgeCollection(profile.collection("devices")) }
        guard let workspaceID = plan.workspaceID else {
            let current = try await profile.getDocument(source: .server)
            guard current.get("workspaceID") == nil else { throw HandlaError.message("Ditt hushåll har ändrats. Öppna raderingen igen.") }
            if current.exists { try await profile.delete() }
            return
        }
        let workspace = db.collection("workspaces").document(workspaceID)
        let ownMember = workspace.collection("members").document(userID)
        if !plan.owner {
            try await scrubActorIdentity(workspace: workspace, userID: userID)
            _ = try await db.runTransaction { transaction, errorPointer in
                do {
                    let current = try transaction.getDocument(workspace)
                    let currentProfile = try transaction.getDocument(profile)
                    guard current.get("ownerID") as? String != userID,
                          currentProfile.get("workspaceID") as? String == workspaceID else {
                        throw HandlaError.message("Ditt hushåll eller din roll har ändrats. Öppna raderingen igen.")
                    }
                    transaction.deleteDocument(ownMember); transaction.deleteDocument(profile)
                    return true
                } catch { errorPointer?.pointee = error as NSError; return nil }
            }
            return
        }
        _ = try await db.runTransaction { transaction, errorPointer in
            do {
                let current = try transaction.getDocument(workspace)
                let currentProfile = try transaction.getDocument(profile)
                guard current.get("ownerID") as? String == userID,
                      currentProfile.get("workspaceID") as? String == workspaceID else {
                    throw HandlaError.message("Hushållet har ändrats. Öppna raderingen igen.")
                }
                if let token = current.get("inviteToken") as? String { transaction.deleteDocument(self.db.collection("invites").document(token)) }
                transaction.updateData(["deletingBy": userID, "inviteToken": FieldValue.delete()], forDocument: workspace)
                return true
            } catch { errorPointer?.pointee = error as NSError; return nil }
        }
        // The lock blocks joins and normal writes, so this server query is an authoritative stable roster.
        let members = try await workspace.collection("members").getDocuments(source: .server)
        let successor = members.documents.filter { $0.documentID != userID }.sorted { $0.documentID < $1.documentID }.first
        guard successor?.documentID == plan.successorID else {
            let unlock = db.batch()
            unlock.updateData(["deletingBy": FieldValue.delete()], forDocument: workspace)
            if pushDataEnabled { unlock.updateData(["deletingAccount": FieldValue.delete()], forDocument: profile) }
            try await unlock.commit()
            throw HandlaError.message("Medlemmarna har ändrats. Öppna raderingen igen för att bekräfta den nya ägaren. Den tidigare inbjudningslänken har återkallats.")
        }
        if let successor {
            try await scrubActorIdentity(workspace: workspace, userID: userID)
            _ = try await db.runTransaction { transaction, errorPointer in
                do {
                    let current = try transaction.getDocument(workspace)
                    let recipient = try transaction.getDocument(successor.reference)
                    _ = try transaction.getDocument(profile)
                    guard current.get("deletingBy") as? String == userID, recipient.exists else {
                        throw HandlaError.message("Hushållet har ändrats. Öppna raderingen igen.")
                    }
                    transaction.updateData(["ownerID": successor.documentID, "deletingBy": FieldValue.delete(), "inviteToken": FieldValue.delete()], forDocument: workspace)
                    transaction.updateData(["role": "owner"], forDocument: successor.reference)
                    transaction.deleteDocument(ownMember); transaction.deleteDocument(profile)
                    return true
                } catch { errorPointer?.pointee = error as NSError; return nil }
            }
        } else {
            // Delete bounded batches; keep workspace/self membership until child cleanup is acknowledged.
            while true {
                let lists = try await workspace.collection("lists").limit(to: 100).getDocuments(source: .server)
                if lists.isEmpty { break }
                for list in lists.documents {
                    try await purgeCollection(list.reference.collection("items"))
                    try await list.reference.delete()
                }
            }
            try await purgeCollection(workspace.collection("products"))
            let batch = db.batch()
            batch.deleteDocument(ownMember); batch.deleteDocument(profile); batch.deleteDocument(workspace)
            try await batch.commit()
        }
    }
    private func scrubActorIdentity(workspace: DocumentReference, userID: String) async throws {
        // Attribution is independent of push. Remove only this user's identity
        // references and retain useful item dates and everyone else's authorship.
        let fields = ["createdByUID", "updatedByUID"] + (pushDataEnabled ? ["lastActorUID"] : [])
        let lists = try await workspace.collection("lists").getDocuments(source: .server)
        for list in lists.documents {
            for field in fields {
                while true {
                    let page = try await list.reference.collection("items").whereField(field, isEqualTo: userID).limit(to: 200).getDocuments(source: .server)
                    if page.isEmpty { break }
                    let references = page.documents.map(\.reference)
                    _ = try await db.runTransaction { transaction, errorPointer in
                        do {
                            // Read again inside the transaction: another shopper may
                            // have become the last editor after the paged query.
                            let current = try references.map { try transaction.getDocument($0) }
                            for item in current where item.get(field) as? String == userID {
                                var removal: [String: Any] = [field: FieldValue.delete()]
                                if field == "lastActorUID" { removal["lastActionAt"] = FieldValue.delete() }
                                transaction.updateData(removal, forDocument: item.reference)
                            }
                            return true
                        } catch { errorPointer?.pointee = error as NSError; return nil }
                    }
                }
            }
        }
    }
    private func purgeCollection(_ collection: CollectionReference) async throws {
        while true {
            let page = try await collection.limit(to: 200).getDocuments(source: .server)
            if page.isEmpty { return }
            let batch = db.batch()
            for document in page.documents { batch.deleteDocument(document.reference) }
            try await batch.commit()
        }
    }
}
