import Foundation
import Combine
import CryptoKit
import AuthenticationServices
import FirebaseAuth
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
struct ShoppingList: Identifiable { let id: String; let name: String }
struct Grocery: Identifiable {
    let id: String
    let name: String
    let quantity: String
    let checked: Bool
    let category: GroceryCategory
    let createdAt: Date?
    let checkedAt: Date?

    init(id: String, name: String, quantity: String, checked: Bool, category: GroceryCategory = .other, createdAt: Date? = nil, checkedAt: Date? = nil) {
        self.id = id; self.name = name; self.quantity = quantity; self.checked = checked; self.category = category
        self.createdAt = createdAt; self.checkedAt = checkedAt
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
    private var attemptedIdentityFill = false
    @Published var listsPending = false
    @Published var loading = false
    @Published var busy = false
    @Published var error: String?
    @Published var workspaceID: String?
    @Published var workspaceName = ""
    @Published var owner = false
    @Published var lists: [ShoppingList] = []
    @Published var suggestions: [GrocerySuggestion] = GroceryCatalog.builtIn
    @Published var invitation: Invitation?
    @Published var inviteURL: URL?
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
                        guard let self, self.sessionGeneration == generation else { return }
                        if let error { self.loading = false; self.error = error.localizedDescription; return }
                        // An empty local cache does not prove this is a new account.
                        guard let snapshot else { return }
                        // Local profile creation precedes server membership authorization.
                        // Start shared-data listeners only after the atomic batch is acknowledged.
                        guard !snapshot.metadata.hasPendingWrites else { return }
                        if let id = snapshot.get("workspaceID") as? String {
                            self.watchWorkspace(id)
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
        memberCount = 0; members = []; attemptedIdentityFill = false; listsPending = false
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
                self.lists = (snapshot?.documents ?? []).map { ShoppingList(id: $0.documentID, name: $0.get("name") as? String ?? "Lista") }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
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
        listeners.append(ref.collection("members").addSnapshotListener { [weak self] snapshot, error in
            Task { @MainActor [weak self] in
                guard let self, self.sessionGeneration == generation, self.workspaceID == id else { return }
                if let error { self.error = error.localizedDescription; return }
                let documents = snapshot?.documents ?? []
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
        batch.setData(["workspaceID": ref.documentID], forDocument: db.collection("users").document(userID))
        batch.setData(["name": "Veckohandling"], forDocument: ref.collection("lists").document())
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
        let generation = sessionGeneration
        db.collection("workspaces").document(workspaceID).collection("lists").addDocument(data: ["name": name]) { [weak self] error in
            Task { @MainActor [weak self] in
                guard let self, self.sessionGeneration == generation else { return }
                if let error { self.error = error.localizedDescription }
            }
        }
    }
    func renameList(_ id: String, name: String) throws {
        let workspaceID = try requireWorkspace()
        let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name.count <= 80 else { throw HandlaError.message("Ange ett namn med högst 80 tecken.") }
        let generation = sessionGeneration
        db.collection("workspaces").document(workspaceID).collection("lists").document(id).updateData(["name": name]) { [weak self] error in
            Task { @MainActor [weak self] in
                guard let self, self.sessionGeneration == generation else { return }
                if let error { self.error = error.localizedDescription }
            }
        }
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
        batch.setData(["name": name, "quantity": quantity.trimmingCharacters(in: .whitespacesAndNewlines), "checked": false, "category": category.rawValue, "createdAt": FieldValue.serverTimestamp(), "checkedAt": NSNull()], forDocument: items.document())
        batch.setData(["name": name, "category": category.rawValue], forDocument: db.collection("workspaces").document(workspaceID).collection("products").document(key))
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
        batch.updateData(["name": name, "quantity": quantity.trimmingCharacters(in: .whitespacesAndNewlines), "category": category.rawValue], forDocument: items.document(id))
        batch.setData(["name": name, "category": category.rawValue], forDocument: db.collection("workspaces").document(workspaceID).collection("products").document(key))
        let generation = sessionGeneration
        batch.commit { [weak self] error in
            Task { @MainActor [weak self] in
                guard let self, self.sessionGeneration == generation else { return }
                if let error { self.error = error.localizedDescription }
            }
        }
    }
    func signOut() throws {
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
