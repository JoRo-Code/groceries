import SwiftUI
import AuthenticationServices
import FirebaseFirestore

struct RootView: View {
    @EnvironmentObject private var store: Store
    @State private var name = ""
    @State private var link = ""
    @State private var deletingAccount = false
    @Environment(\.scenePhase) private var scenePhase
    private var shoppingPreview: Bool {
        #if DEBUG
        ["--preview-shopping", "--preview-lists", "--preview-add", "--preview-history", "--preview-details", "--preview-members"].contains(where: ProcessInfo.processInfo.arguments.contains)
        #else
        false
        #endif
    }
    var body: some View {
        NavigationStack {
            Group {
                if shoppingPreview {
                    ListsView(preview: true, showOverviewInitially: ProcessInfo.processInfo.arguments.contains("--preview-lists"), showAddInitially: ProcessInfo.processInfo.arguments.contains("--preview-add"))
                } else if !store.configured {
                    ContentUnavailableView("Anslut Firebase", systemImage: "externaldrive.badge.plus", description: Text("Lägg till projektets GoogleService-Info.plist i Xcode för att börja använda Handla."))
                } else if store.loading {
                    ProgressView("Hämtar ditt hushåll…")
                } else if !store.signedIn {
                    SignInView()
                } else if store.workspaceID == nil {
                    Form {
                        Section {
                            Text("Välkommen hem").font(.title.bold())
                            Text("Skapa ett gemensamt hushåll för era inköpslistor, eller anslut via en inbjudan.").foregroundStyle(.secondary)
                        }
                        Section("Ett nytt hushåll") {
                            TextField("Exempelvis Familjen Andersson", text: $name)
                            Button("Skapa hushåll") { store.perform { try await store.createWorkspace(name) } }.disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || store.busy)
                        }
                        Section("Har du fått en inbjudan?") {
                            TextField("Klistra in inbjudningslänken", text: $link).textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                            Button("Öppna inbjudan") {
                                if let url = URL(string: link.trimmingCharacters(in: .whitespacesAndNewlines)) { store.receive(url) }
                                else { store.error = "Ange en giltig inbjudningslänk." }
                            }.disabled(link.isEmpty)
                        }
                        Section { AccountLinks(); Button("Radera konto", role: .destructive) { deletingAccount = true }.disabled(store.busy) }
                        Button("Logga ut") { do { try store.signOut() } catch { store.error = error.localizedDescription } }.disabled(store.busy)
                    }.navigationTitle("Handla")
                } else { ListsView() }
            }
        }
        .id(store.sessionID)
        .sheet(isPresented: $deletingAccount) { AccountDeletionView() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await store.loadPendingInvite() } }
        }
        .sheet(item: $store.invitation, onDismiss: store.dismissInvite) { invite in
            VStack(spacing: 24) {
                Image(systemName: "person.2.fill").font(.largeTitle).foregroundStyle(.indigo)
                Text("Välkommen till \(invite.name)").font(.title.bold()).multilineTextAlignment(.center)
                Text("Ni delar alla inköpslistor och sparade varor i hushållet.").multilineTextAlignment(.center)
                Button("Anslut till hushållet") { store.perform { try await store.join(invite) } }
                    .buttonStyle(.borderedProminent).tint(HandlaPalette.filledButton).disabled(store.busy)
                Button("Inte nu") { store.dismissInvite() }.disabled(store.busy)
                if let error = store.error { Text(error).foregroundStyle(.red).font(.caption) }
            }.padding(32).presentationDetents([.medium, .large]).interactiveDismissDisabled(store.busy)
        }
        .alert("Kunde inte slutföra", isPresented: Binding(get: { store.error != nil && store.invitation == nil && !store.deletingAccount }, set: { if !$0 { store.error = nil } })) {
            Button("OK") { store.error = nil }
        } message: { Text(store.error ?? "") }
    }
}

struct SignInView: View {
    @Environment(\.colorScheme) private var colorScheme
    @EnvironmentObject private var store: Store
    @State private var email = ""
    @State private var password = ""
    @State private var creatingAccount = false
    @State private var resetSent = false

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                Image(systemName: "basket.fill").font(.system(size: 48)).foregroundStyle(.indigo)
                Text("Lite enklare att handla ihop.").font(.largeTitle.bold()).multilineTextAlignment(.center)
                Text("Använd samma konto på webben och i appen.").foregroundStyle(.secondary).multilineTextAlignment(.center)
                Picker("Inloggning", selection: $creatingAccount) {
                    Text("Logga in").tag(false)
                    Text("Skapa konto").tag(true)
                }.pickerStyle(.segmented).disabled(store.busy)
                VStack(spacing: 12) {
                    TextField("E-postadress", text: $email)
                        .textContentType(.emailAddress).keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .accessibilityLabel("E-postadress")
                    SecureField("Lösenord", text: $password)
                        .textContentType(creatingAccount ? .newPassword : .password)
                        .submitLabel(.go).onSubmit(authenticate)
                        .accessibilityLabel("Lösenord")
                }.textFieldStyle(.roundedBorder).disabled(store.busy)
                if creatingAccount { Text("Minst 6 tecken i lösenordet.").font(.caption).foregroundStyle(.secondary) }
                Button(action: authenticate) {
                    HStack {
                        Spacer()
                        if store.busy { ProgressView().tint(.white) }
                        Text(creatingAccount ? "Skapa konto" : "Logga in")
                        Spacer()
                    }.frame(minHeight: 36)
                }.buttonStyle(.borderedProminent).tint(HandlaPalette.filledButton)
                    .disabled(store.busy || email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || password.isEmpty)
                if !creatingAccount {
                    Button("Glömt lösenordet?") {
                        store.perform { try await store.sendPasswordReset(email: email); resetSent = true }
                    }.disabled(store.busy)
                }
                HStack { Rectangle().frame(height: 1); Text("eller").font(.caption); Rectangle().frame(height: 1) }.foregroundStyle(.tertiary)
                SignInWithAppleButton(.continue, onRequest: store.prepareApple, onCompletion: store.finishApple)
                    .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
                    .frame(height: 50).clipShape(RoundedRectangle(cornerRadius: 12)).disabled(store.busy)
            AccountLinks().font(.footnote)
            }.padding(28)
        }
        .scrollDismissesKeyboard(.interactively)
        .alert("Kontrollera din inkorg", isPresented: $resetSent) {
            Button("OK", role: .cancel) {}
        } message: { Text("Om adressen har ett konto får du ett mejl med en länk för att välja nytt lösenord.") }
    }
    private func authenticate() {
        guard !store.busy else { return }
        store.perform { try await store.authenticate(email: email, password: password, creatingAccount: creatingAccount) }
    }
}

struct ListsView: View {
    @EnvironmentObject private var store: Store
    let preview: Bool
    let showAddInitially: Bool
    @State private var showingOverview: Bool
    @State private var selectedID: String?
    @State private var exampleLists = ShoppingExamples.lists
    @State private var exampleItems = ShoppingExamples.items

    init(preview: Bool = false, showOverviewInitially: Bool = false, showAddInitially: Bool = false) {
        self.preview = preview; self.showAddInitially = showAddInitially
        _showingOverview = State(initialValue: showOverviewInitially)
    }
    private var lists: [ShoppingList] { preview ? exampleLists : store.lists }
    private var selected: ShoppingList? { lists.first(where: { $0.id == selectedID }) ?? lists.first }
    var body: some View {
        Group {
            if showingOverview || selected == nil {
                ListOverview(lists: lists, preview: preview, canGoBack: selected != nil,
                    exampleItems: exampleItems,
                    onBack: { showingOverview = false },
                    onSelect: { selectedID = $0.id; showingOverview = false },
                    onCreate: { name in
                        if preview {
                            let list = ShoppingList(id: UUID().uuidString, name: name)
                            exampleLists.append(list); exampleItems[list.id] = []
                            selectedID = list.id; showingOverview = false
                        } else { try store.addList(name) }
                    })
            } else if let selected {
                ItemsView(list: selected, listCount: lists.count, preview: preview,
                    exampleItems: Binding(get: { exampleItems[selected.id] ?? [] }, set: { exampleItems[selected.id] = $0 }),
                    showAddInitially: showAddInitially, onShowLists: { showingOverview = true }, onRename: { name in
                        selectedID = selected.id
                        if preview, let index = exampleLists.firstIndex(where: { $0.id == selected.id }) {
                            exampleLists[index] = ShoppingList(id: selected.id, name: name)
                        } else { try store.renameList(selected.id, name: name) }
                    })
                    .id(selected.id)
            }
        }
        .background(Color(uiColor: .systemBackground))
        .toolbar(.hidden, for: .navigationBar)
    }
}

struct WorkspaceView: View {
    @State private var deletingAccount = false
    @AppStorage("appearance") private var appearance = AppAppearance.system.rawValue
    var preview = false
    private var sampleMembers: [HouseholdMember] {
        [HouseholdMember(id: "sample-owner", role: "owner", displayName: "Alex Andersson", isCurrentUser: true),
         HouseholdMember(id: "sample-member", role: "member", displayName: "Sam Svensson", isCurrentUser: false)]
    }
    private var roster: [HouseholdMember] { preview ? sampleMembers : store.members }
    @EnvironmentObject private var store: Store
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            Form {
                Section("Utseende") {
                    Picker("Utseende", selection: $appearance) {
                        ForEach(AppAppearance.allCases, id: \.rawValue) { option in
                            Text(option.title).tag(option.rawValue)
                        }
                    }.pickerStyle(.segmented)
                }
                Section("Hushåll") {
                    Label(preview ? "Exempelhushållet" : store.workspaceName, systemImage: "house.fill")
                    Text("\(roster.count) \(roster.count == 1 ? "medlem" : "medlemmar")").foregroundStyle(.secondary)
                    Text("Alla medlemmar kan lägga till varor, bocka av och skapa listor.").foregroundStyle(.secondary)
                }
                Section("Medlemmar") {
                    ForEach(roster) { member in
                        HStack(spacing: 12) {
                            Text(member.initials).font(.headline).foregroundStyle(handlaBlue)
                                .frame(width: 42, height: 42).background(handlaBlue.opacity(0.12), in: Circle())
                            VStack(alignment: .leading, spacing: 3) {
                                Text(member.name).font(.body.weight(.medium))
                                Text(member.role == "owner" ? "Ägare" : "Medlem").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if member.isCurrentUser { Text("Du").font(.caption.weight(.semibold)).foregroundStyle(handlaBlue) }
                        }.padding(.vertical, 3)
                    }
                    if roster.isEmpty { Text("Hämtar medlemmar…").foregroundStyle(.secondary) }
                    if preview && showPreviewWatermark { Text("Förhandsvisning · exempeldata").font(.caption).foregroundStyle(.secondary) }
                }
                if store.owner && !preview {
                    Section {
                        if let url = store.inviteURL {
                            ShareLink(item: url) { Label("Dela inbjudan", systemImage: "square.and.arrow.up") }
                        }
                        Button("Skapa ny inbjudningslänk") { store.perform { try await store.createInvite() } }.disabled(store.busy)
                        Button("Återkalla inbjudningslänken", role: .destructive) { store.perform { try await store.revokeInvite() } }.disabled(store.busy)
                    } header: { Text("Bjud in") } footer: {
                        Text("En länk gäller i sju dagar. Alla som har den kan ansluta. En ny länk ersätter den gamla. Befintliga medlemmar påverkas inte.")
                    }
                }
                if let error = store.error { Section { Text(error).foregroundStyle(.red) } }
                Section("Om Handla") { AccountLinks() }
                if !preview { Section("Konto") { Button("Radera konto", role: .destructive) { deletingAccount = true }.disabled(store.busy) } }
                if !preview { Button("Logga ut") { do { try store.signOut(); dismiss() } catch { store.error = error.localizedDescription } }.disabled(store.busy) }
            }.navigationTitle("Ert hushåll").toolbar { Button("Klart") { dismiss() }.disabled(store.deletingAccount) }
            .sheet(isPresented: $deletingAccount) { AccountDeletionView() }
        }
    }
}

private enum HandlaPalette {
    static func uiColor(_ hex: UInt32) -> UIColor {
        UIColor(red: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: 1)
    }
    static func adaptive(light: UInt32, dark: UInt32) -> Color {
        Color(uiColor: UIColor { traits in uiColor(traits.userInterfaceStyle == .dark ? dark : light) })
    }
    static func chip(light: UInt32, dark: UInt32) -> Color {
        Color(uiColor: UIColor { traits in
            let isDark = traits.userInterfaceStyle == .dark
            let foreground = isDark ? dark : light
            let base: CGFloat = isDark ? 0.11 : 1
            let amount: CGFloat = isDark ? 0.24 : 0.17
            return UIColor(red: base + (CGFloat((foreground >> 16) & 255) / 255 - base) * amount,
                           green: base + (CGFloat((foreground >> 8) & 255) / 255 - base) * amount,
                           blue: base + (CGFloat(foreground & 255) / 255 - base) * amount, alpha: 1)
        })
    }
    static let divider = adaptive(light: 0xD0D4DA, dark: 0x454850)
    // White plus marks retain contrast even when the surrounding dark-mode tint becomes lighter.
    static let filledButton = Color(uiColor: uiColor(0x006DC4))
    static let listColors: [Color] = [
        adaptive(light: 0x087178, dark: 0x70D8DD), .primary,
        adaptive(light: 0xA62065, dark: 0xF59AC2),
        adaptive(light: 0x5143A3, dark: 0xBAACFF),
        adaptive(light: 0x945000, dark: 0xFFC078)
    ]
}

private extension GroceryCategory {
    var palette: (light: UInt32, dark: UInt32) {
        switch self {
        case .produce: (0x397B24, 0x9DD984)
        case .dairy: (0x206CA1, 0x8BCBFA)
        case .meat: (0xA93243, 0xFFA3AF)
        case .fish: (0x0B7178, 0x7CD9DF)
        case .bakery: (0x835917, 0xE7BE7D)
        case .pantry: (0x75620E, 0xEAD573)
        case .frozen: (0x4E5FA8, 0xABBDFC)
        case .drinks: (0x7F479D, 0xD5AEF0)
        case .snacks: (0xAB4E23, 0xFFB28C)
        case .household: (0x536478, 0xB4C6DC)
        case .hygiene: (0x9E4878, 0xECA9D0)
        case .other: (0x60605D, 0xC9C9C2)
        }
    }
    var color: Color { HandlaPalette.adaptive(light: palette.light, dark: palette.dark) }
    var chipBackground: Color { HandlaPalette.chip(light: palette.light, dark: palette.dark) }
}

private let handlaBlue = HandlaPalette.adaptive(light: 0x006DC4, dark: 0x76C1FF)

@MainActor
private final class GroceryObservation: ObservableObject {
    @Published var items: [Grocery] = []
    @Published var loading = true
    @Published var loadingOlder = false
    @Published var hasOlder = true
    @Published var pending = false
    @Published var fromCache = false
    private var listeners: [ListenerRegistration] = []
    private var recentListener: ListenerRegistration?
    private var pageListeners: [ListenerRegistration] = []
    private var timer: Task<Void, Never>?
    private var observationID = UUID()
    private var isRunning = false
    private var groups: [String: [Grocery]] = [:]
    private var watchTokens: [String: UUID] = [:]
    private var metadata: [String: (Bool, Bool)] = [:]
    private var cutoff = Date().addingTimeInterval(-86400)
    private var cursor: DocumentSnapshot?
    private var unknownPhase = false
    private var historyOpened = false
    private var page = 0

    private func parse(_ document: QueryDocumentSnapshot) -> Grocery {
        let data = document.data(with: .estimate)
        let name = data["name"] as? String ?? ""
        return Grocery(id: document.documentID, name: name, quantity: data["quantity"] as? String ?? "", checked: data["checked"] as? Bool ?? false,
            category: (data["category"] as? String).flatMap(GroceryCategory.init(rawValue:)) ?? GroceryCatalog.category(for: name),
            createdAt: (data["createdAt"] as? Timestamp)?.dateValue(), checkedAt: (data["checkedAt"] as? Timestamp)?.dateValue())
    }
    private func publish() {
        var merged: [String: Grocery] = [:]
        for key in groups.keys.sorted() { for item in groups[key] ?? [] { merged[item.id] = item } }
        for item in groups["recent"] ?? [] { merged[item.id] = item }
        for item in groups["active"] ?? [] { merged[item.id] = item }
        items = Array(merged.values)
        pending = metadata.values.contains { $0.0 }
        fromCache = metadata.values.contains { $0.1 }
    }
    private func listen(_ query: Query, key: String, store: Store) -> ListenerRegistration {
        let id = observationID, session = store.sessionID, token = UUID()
        watchTokens[key] = token
        return query.addSnapshotListener(includeMetadataChanges: true) { [weak self] snapshot, error in
            Task { @MainActor [weak self] in
                guard let self, self.observationID == id, store.sessionID == session, self.watchTokens[key] == token else { return }
                if let error { store.error = error.localizedDescription; self.loading = false; return }
                self.groups[key] = (snapshot?.documents ?? []).map(self.parse)
                self.metadata[key] = (snapshot?.metadata.hasPendingWrites ?? false, snapshot?.metadata.isFromCache ?? false)
                self.loading = false
                self.publish()
            }
        }
    }
    func start(store: Store, listID: String, activeOnly: Bool = false) {
        stop(); isRunning = true; loading = true; loadingOlder = false; hasOlder = true
        groups = [:]; metadata = [:]; items = []; cursor = nil; unknownPhase = false; historyOpened = false; page = 0
        cutoff = Date().addingTimeInterval(-86400)
        guard let ref = store.itemsRef(listID) else { loading = false; return }
        listeners.append(listen(ref.whereField("checked", isEqualTo: false), key: "active", store: store))
        guard !activeOnly else { return }
        refreshRecent(store: store, ref: ref)
        timer = Task { [weak self] in
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(60)) } catch { return }
                guard let self else { return }
                if !self.historyOpened { await self.refresh(store: store, listID: listID) }
            }
        }
    }
    func refresh(store: Store, listID: String) async {
        guard isRunning, !loadingOlder, let ref = store.itemsRef(listID) else { return }
        let wasOpen = historyOpened
        pageListeners.forEach { $0.remove() }; pageListeners = []
        for key in Array(groups.keys) where key.hasPrefix("page-") { groups.removeValue(forKey: key); metadata.removeValue(forKey: key); watchTokens.removeValue(forKey: key) }
        cursor = nil; unknownPhase = false; hasOlder = true; page = 0
        cutoff = Date().addingTimeInterval(-86400)
        refreshRecent(store: store, ref: ref); publish()
        if wasOpen { await loadOlder(store: store, listID: listID) }
    }
    private func refreshRecent(store: Store, ref: CollectionReference) {
        recentListener?.remove()
        recentListener = listen(ref.whereField("checked", isEqualTo: true).whereField("checkedAt", isGreaterThanOrEqualTo: Timestamp(date: cutoff)).order(by: "checkedAt", descending: true), key: "recent", store: store)
    }
    func loadOlder(store: Store, listID: String) async {
        guard isRunning, !loadingOlder, hasOlder, let ref = store.itemsRef(listID) else { return }
        loadingOlder = true; historyOpened = true
        let id = observationID, session = store.sessionID
        var query: Query = ref.whereField("checked", isEqualTo: true)
        if unknownPhase { query = query.whereField("checkedAt", isEqualTo: NSNull()).order(by: FieldPath.documentID()) }
        else { query = query.whereField("checkedAt", isLessThan: Timestamp(date: cutoff)).order(by: "checkedAt", descending: true) }
        if let cursor { query = query.start(afterDocument: cursor) }
        do {
            let snapshot = try await query.limit(to: 21).getDocuments()
            guard observationID == id, store.sessionID == session else { return }
            let documents = Array(snapshot.documents.prefix(20))
            if let last = documents.last {
                let key = "page-\(page)"; page += 1
                groups[key] = documents.map(parse); publish()
                // Keep loaded history live, including edits, deletion and restoration from another member.
                pageListeners.append(listen(query.end(atDocument: last), key: key, store: store))
                cursor = last
            }
            let continueWithUnknown = documents.isEmpty && !unknownPhase
            if snapshot.documents.count <= 20 {
                if unknownPhase { hasOlder = false }
                else { unknownPhase = true; cursor = nil }
            }
            loadingOlder = false
            if continueWithUnknown { await loadOlder(store: store, listID: listID) }
        } catch {
            guard observationID == id, store.sessionID == session else { return }
            loadingOlder = false; store.error = error.localizedDescription
        }
    }
    func stop() {
        isRunning = false
        listeners.forEach { $0.remove() }; listeners = []
        pageListeners.forEach { $0.remove() }; pageListeners = []
        recentListener?.remove(); recentListener = nil; timer?.cancel(); timer = nil
        observationID = UUID()
    }
}

struct ItemsView: View {
    @EnvironmentObject private var store: Store
    @Environment(\.scenePhase) private var scenePhase
    let list: ShoppingList
    let listCount: Int
    let preview: Bool
    @Binding var exampleItems: [Grocery]
    let onShowLists: () -> Void
    let onRename: (String) throws -> Void
    @StateObject private var observation = GroceryObservation()
    @FocusState private var addFocused: Bool
    @State private var query = ""
    @State private var quantity = ""
    @State private var category: GroceryCategory = .other
    @State private var manualCategory = false
    @State private var fullCatalogue = false
    @State private var adding: Bool
    @State private var revealName: String?
    @State private var renaming = false
    @State private var renamedList = ""
    @State private var previewHistoryCount = 0
    @State private var editing: Grocery?
    @State private var showingWorkspace = false

    init(list: ShoppingList, listCount: Int, preview: Bool, exampleItems: Binding<[Grocery]>, showAddInitially: Bool = false, onShowLists: @escaping () -> Void, onRename: @escaping (String) throws -> Void) {
        self.list = list; self.listCount = listCount; self.preview = preview
        _exampleItems = exampleItems; self.onShowLists = onShowLists; self.onRename = onRename
        _adding = State(initialValue: showAddInitially)
    }
    private var items: [Grocery] { preview ? exampleItems : observation.items }
    private var active: [Grocery] { ordered(items.filter { !$0.checked }) }
    private var bought: [Grocery] {
        let checked = items.filter(\.checked).sorted { ($0.checkedAt ?? .distantPast) > ($1.checkedAt ?? .distantPast) }
        guard preview else { return checked }
        let cutoff = Date().addingTimeInterval(-86400)
        return checked.filter { ($0.checkedAt ?? .distantPast) >= cutoff } + Array(checked.filter { ($0.checkedAt ?? .distantPast) < cutoff }.prefix(previewHistoryCount))
    }
    private var canLoadOlder: Bool {
        preview ? previewHistoryCount < items.filter { $0.checked && ($0.checkedAt ?? .distantPast) < Date().addingTimeInterval(-86400) }.count : observation.hasOlder
    }
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button(action: onShowLists) {
                    ZStack {
                        Image(systemName: "square.on.square").font(.system(size: 25, weight: .light))
                        Text("\(listCount)").font(.system(size: 12, weight: .medium)).offset(x: 3, y: 2)
                    }.frame(width: 44, height: 44)
                }.accessibilityLabel("Mina listor, \(listCount) listor")
                Spacer().frame(height: 44).contentShape(Rectangle()).onTapGesture { if adding { closeComposer() } }
                Button { showingWorkspace = true } label: {
                    Image(systemName: "person.2").font(.system(size: 24, weight: .light)).frame(width: 44, height: 44)
                }.accessibilityLabel("Hushållets medlemmar")
                Menu {
                    Button("Byt namn", systemImage: "pencil") { renamedList = list.name; renaming = true }
                    Button("Mina listor", systemImage: "list.bullet") { onShowLists() }
                    Button("Ert hushåll", systemImage: "person.2") { showingWorkspace = true }
                } label: {
                    Image(systemName: "ellipsis").font(.system(size: 25, weight: .medium)).frame(width: 44, height: 44)
                }.accessibilityLabel("Fler alternativ")
            }.foregroundStyle(handlaBlue).padding(.horizontal, 14).padding(.top, 3)
            VStack(alignment: .leading, spacing: 16) {
                Text(list.name).font(.system(size: 36, weight: .bold)).tracking(-0.8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle()).onTapGesture { if adding { closeComposer() } }
                HStack(spacing: 10) {
                    Image(systemName: "plus").font(.system(size: 21, weight: .light)).foregroundStyle(Color(uiColor: .secondaryLabel))
                    TextField("Ny vara", text: $query, prompt: Text("Ny vara").foregroundStyle(Color(uiColor: .secondaryLabel))).font(.system(size: 19)).focused($addFocused)
                        .submitLabel(.done).onSubmit { add(query, category: category) }
                        .accessibilityLabel("Ny vara")
                        .onTapGesture { adding = true; addFocused = true }
                    if adding {
                        Button(action: closeComposer) { Image(systemName: "xmark").font(.system(size: 18)).frame(width: 32, height: 44) }
                            .accessibilityLabel("Stäng lägg till vara")
                    }
                }.padding(.horizontal, 15).frame(height: 51)
                    .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
            }.padding(.horizontal, 23).padding(.top, 15).padding(.bottom, 19)
                .background { Color.clear.contentShape(Rectangle()).onTapGesture { if adding { closeComposer() } } }
            GeometryReader { geometry in
                ScrollViewReader { proxy in
                ZStack(alignment: .top) {
                ScrollView {
                    VStack(spacing: 0) {
                        if !preview && observation.loading {
                            ProgressView().padding(24)
                        } else if items.isEmpty {
                            Text("Lägg till det ni behöver handla.").foregroundStyle(.secondary).padding(.top, 26)
                        }
                        VStack(spacing: 0) { ForEach(active) { item in groceryRow(item) } }
                        Spacer(minLength: bought.isEmpty ? 32 : 80)
                        if !bought.isEmpty {
                            VStack(spacing: 0) {
                                DashedDivider().stroke(style: StrokeStyle(lineWidth: 0.7, dash: [2, 3])).frame(height: 1).foregroundStyle(HandlaPalette.divider)
                                ForEach(bought) { item in groceryRow(item) }
                                Spacer(minLength: 12)
                            }
                            .frame(minHeight: geometry.size.height * 0.28, alignment: .top)
                            .background(Color(uiColor: .secondarySystemBackground))
                        }
                        if canLoadOlder {
                            Button {
                                if preview { previewHistoryCount += 20 }
                                else { Task { await observation.loadOlder(store: store, listID: list.id) } }
                            } label: {
                                if observation.loadingOlder { ProgressView() }
                                else { Text("Visa äldre inköp") }
                            }.disabled(observation.loadingOlder).padding(18)
                        }
                        if !preview && (observation.pending || observation.fromCache) {
                            Text(observation.pending ? "Väntar på synkning…" : "Visar sparad lista")
                                .font(.caption).foregroundStyle(.secondary).padding(10)
                        }
                        if preview && showPreviewWatermark {
                            Text("Förhandsvisning · exempeldata").font(.caption2).foregroundStyle(.tertiary).padding(7)
                        }
                    }.frame(minHeight: geometry.size.height, alignment: .top)
                }.scrollIndicators(.hidden).scrollDisabled(adding).allowsHitTesting(!adding)
                .task(id: "\(adding)-\(revealName ?? "")-\(items.first(where: { GroceryCatalog.normalized($0.name) == revealName && !$0.checked })?.id ?? "")") {
                    guard !adding, let name = revealName,
                          let item = items.first(where: { GroceryCatalog.normalized($0.name) == name && !$0.checked }) else { return }
                    withAnimation(.easeInOut(duration: 0.25)) { proxy.scrollTo(item.id, anchor: .center) }
                    do { try await Task.sleep(for: .seconds(2)) } catch { return }
                    if revealName == name { withAnimation { revealName = nil } }
                }
                if adding {
                    GrocerySuggestionsOverlay(query: $query, quantity: $quantity, category: $category,
                        manualCategory: $manualCategory, fullCatalogue: $fullCatalogue,
                        items: items, preview: preview, onAdd: add, onClose: closeComposer)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color(uiColor: .systemBackground))
                }
                }
                }
            }
        }
        .background(Color(uiColor: .systemBackground))
        .toolbar(.hidden, for: .navigationBar)
        .tint(handlaBlue)
        .onChange(of: addFocused) { _, focused in if focused { adding = true } }
        .onChange(of: query) { _, value in
            if value.isEmpty { manualCategory = false; category = .other }
            else if !manualCategory { category = store.suggestions.first(where: { $0.id == GroceryCatalog.normalized(value) })?.category ?? GroceryCatalog.category(for: value) }
        }
        .alert("Byt namn på listan", isPresented: $renaming) {
            TextField("Listans namn", text: $renamedList)
            Button("Avbryt", role: .cancel) { }
            Button("Spara") {
                let name = renamedList.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !name.isEmpty, name.count <= 80 else { return }
                do { try onRename(name) } catch { store.error = error.localizedDescription }
            }.disabled(renamedList.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || renamedList.trimmingCharacters(in: .whitespacesAndNewlines).count > 80)
        } message: { Text("Ange ett namn med 1–80 tecken.") }
        .sheet(item: $editing) { item in
            GroceryEditor(item: item, preview: preview) { name, quantity, category in
                if preview {
                    guard let index = exampleItems.firstIndex(where: { $0.id == item.id }) else { return }
                    let current = exampleItems[index]
                    exampleItems[index] = Grocery(id: current.id, name: name, quantity: quantity, checked: current.checked, category: category, createdAt: current.createdAt, checkedAt: current.checkedAt)
                } else { try store.updateItem(item.id, name: name, quantity: quantity, category: category, listID: list.id) }
            }.tint(handlaBlue)
        }
        .sheet(isPresented: $showingWorkspace) { WorkspaceView(preview: preview) }
        .onAppear {
            if !preview { observation.start(store: store, listID: list.id) }
            #if DEBUG
            if adding && !ProcessInfo.processInfo.arguments.contains("--preview-hide-keyboard") { addFocused = true }
            if preview && ProcessInfo.processInfo.arguments.contains("--preview-members") { showingWorkspace = true }
            if preview && ProcessInfo.processInfo.arguments.contains("--preview-history") { previewHistoryCount = 20 }
            if preview && ProcessInfo.processInfo.arguments.contains("--preview-details") { editing = exampleItems.first(where: { $0.id == "bread" }) }
            #endif
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active && !preview { Task { await observation.refresh(store: store, listID: list.id) } }
        }
        .onDisappear { observation.stop() }
    }
    private func closeComposer() {
        addFocused = false; adding = false; revealName = nil
        query = ""; quantity = ""; category = .other; manualCategory = false; fullCatalogue = false
    }
    private func add(_ rawName: String, category: GroceryCategory) {
        let name = rawName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        if let existing = items.first(where: { GroceryCatalog.normalized($0.name) == GroceryCatalog.normalized(name) }) {
            if existing.checked {
                if preview, let index = exampleItems.firstIndex(where: { $0.id == existing.id }) {
                    exampleItems[index] = Grocery(id: existing.id, name: existing.name, quantity: existing.quantity, checked: false, category: existing.category, createdAt: existing.createdAt, checkedAt: existing.checkedAt)
                } else {
                    let session = store.sessionID
                    store.itemsRef(list.id)?.document(existing.id).updateData(["checked": false]) { error in
                        Task { @MainActor in if store.sessionID == session, let error { store.error = error.localizedDescription } }
                    }
                }
            }
            closeComposer()
            revealName = GroceryCatalog.normalized(existing.name)
            return
        }
        do {
            if preview {
                guard name.count <= 120, quantity.count <= 80 else { throw HandlaError.message("Varunamnet eller mängden är för långt.") }
                exampleItems.append(Grocery(id: UUID().uuidString, name: name, quantity: quantity, checked: false, category: category, createdAt: Date()))
            } else { try store.addItem(name, quantity: quantity, category: category, listID: list.id) }
            closeComposer()
            revealName = GroceryCatalog.normalized(name)
        } catch { store.error = error.localizedDescription }
    }
    private func groceryRow(_ item: Grocery) -> some View {
        HStack(spacing: 0) {
            Rectangle().fill(item.category.color.opacity(item.checked ? 0.8 : 1)).frame(width: 5)
            Button { toggle(item) } label: {
                HStack {
                    Text(item.name).font(.system(size: 22)).strikethrough(item.checked, color: .secondary)
                        .foregroundStyle(item.checked ? .secondary : .primary).multilineTextAlignment(.leading)
                    Spacer(minLength: 4)
                }.padding(.leading, 19).padding(.vertical, 15).contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityLabel("\(item.name), \(item.checked ? "köpt, lägg tillbaka" : "bocka av")")
            Button { editing = item } label: {
                Text(item.quantity.isEmpty ? " " : item.quantity).font(.system(size: 20))
                    .strikethrough(item.checked, color: .secondary).foregroundStyle(.secondary)
                    .frame(minWidth: 44, minHeight: 44, alignment: .trailing).padding(.trailing, 22)
                    .contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityLabel("Ändra \(item.name), mängd \(item.quantity)")
        }
        .frame(minHeight: 58)
        .fixedSize(horizontal: false, vertical: true)
        .background(revealName == GroceryCatalog.normalized(item.name) ? handlaBlue.opacity(0.17) : Color.clear)
        .id(item.id)
        .overlay(alignment: .bottom) { DashedDivider().stroke(style: StrokeStyle(lineWidth: 0.7, dash: [2, 3])).frame(height: 1).padding(.leading, 24).foregroundStyle(HandlaPalette.divider) }
        .contextMenu {
            Button("Ändra vara", systemImage: "pencil") { editing = item }
            Button("Ta bort", systemImage: "trash", role: .destructive) { remove(item) }
        }
    }
    private func toggle(_ item: Grocery) {
        if preview {
            guard let index = exampleItems.firstIndex(where: { $0.id == item.id }) else { return }
            exampleItems[index] = Grocery(id: item.id, name: item.name, quantity: item.quantity, checked: !item.checked, category: item.category, createdAt: item.createdAt, checkedAt: item.checked ? item.checkedAt : Date())
        } else {
            let session = store.sessionID
            store.itemsRef(list.id)?.document(item.id).updateData(item.checked ? ["checked": false] : ["checked": true, "checkedAt": FieldValue.serverTimestamp()]) { error in
                Task { @MainActor in if store.sessionID == session, let error { store.error = error.localizedDescription } }
            }
        }
    }
    private func remove(_ item: Grocery) {
        if preview { exampleItems.removeAll { $0.id == item.id }; return }
        let session = store.sessionID
        store.itemsRef(list.id)?.document(item.id).delete { error in
            Task { @MainActor in if store.sessionID == session, let error { store.error = error.localizedDescription } }
        }
    }
    private func ordered(_ values: [Grocery]) -> [Grocery] {
        values.sorted { $0.category.sortOrder == $1.category.sortOrder ? $0.name.localizedStandardCompare($1.name) == .orderedAscending : $0.category.sortOrder < $1.category.sortOrder }
    }
}

private struct ListOverview: View {
    let lists: [ShoppingList]
    let preview: Bool
    let canGoBack: Bool
    let exampleItems: [String: [Grocery]]
    let onBack: () -> Void
    let onSelect: (ShoppingList) -> Void
    let onCreate: (String) throws -> Void
    @EnvironmentObject private var store: Store
    @State private var creating = false
    @State private var name = ""
    private let colors = HandlaPalette.listColors
    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            VStack(spacing: 0) {
                HStack {
                    if canGoBack { Button(action: onBack) { Image(systemName: "chevron.left").font(.system(size: 25, weight: .light)).frame(width: 44, height: 44) }.accessibilityLabel("Tillbaka till listan") }
                    Spacer()
                }.frame(height: 48).padding(.horizontal, 13)
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Mina listor").font(.system(size: 36, weight: .bold)).tracking(-0.8).padding(.horizontal, 23).padding(.top, 16).padding(.bottom, 26)
                        ForEach(Array(lists.enumerated()), id: \.element.id) { index, list in
                            OverviewRow(list: list, color: colors[index % colors.count], preview: preview, exampleItems: exampleItems[list.id] ?? [], onSelect: { onSelect(list) })
                        }
                        if lists.isEmpty { Text("Skapa din första inköpslista.").foregroundStyle(.secondary).padding(23) }
                    }.padding(.bottom, 100)
                }
            }
            Button { creating = true } label: {
                Image(systemName: "plus").font(.system(size: 31, weight: .light)).foregroundStyle(.white)
                    .frame(width: 65, height: 65).background(HandlaPalette.filledButton, in: Circle()).shadow(color: .black.opacity(0.12), radius: 5, y: 3)
            }.accessibilityLabel("Ny inköpslista").padding(.trailing, 24).padding(.bottom, 22)
        }
        .background(Color(uiColor: .systemBackground)).tint(handlaBlue).toolbar(.hidden, for: .navigationBar)
        .alert("Ny inköpslista", isPresented: $creating) {
            TextField("Listans namn", text: $name)
            Button("Skapa") {
                do { try onCreate(name); name = "" } catch { store.error = error.localizedDescription }
            }.disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            Button("Avbryt", role: .cancel) {}
        }
    }
}

private struct OverviewRow: View {
    @EnvironmentObject private var store: Store
    let list: ShoppingList
    let color: Color
    let preview: Bool
    let exampleItems: [Grocery]
    let onSelect: () -> Void
    @StateObject private var observation = GroceryObservation()
    private var summary: String {
        let names = (preview ? exampleItems : observation.items).filter { !$0.checked }.map(\.name)
        return names.isEmpty ? (observation.loading && !preview ? "Hämtar varor…" : "Inga varor att handla") : names.joined(separator: ", ")
    }
    var body: some View {
        Button(action: onSelect) {
            VStack(alignment: .leading, spacing: 10) {
                Text(list.name).font(.system(size: 25, weight: .bold)).foregroundStyle(color)
                Text(summary).font(.system(size: 18)).foregroundStyle(.secondary).lineLimit(2).multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }.padding(.horizontal, 24).padding(.vertical, 22).frame(minHeight: 119, alignment: .topLeading).contentShape(Rectangle())
        }.buttonStyle(.plain)
            .overlay(alignment: .bottom) { Rectangle().fill(HandlaPalette.divider).frame(height: 0.5) }
            .onAppear { if !preview { observation.start(store: store, listID: list.id, activeOnly: true) } }
            .onDisappear { observation.stop() }
    }
}


private struct GrocerySuggestionsOverlay: View {
    @EnvironmentObject private var store: Store
    @Binding var query: String
    @Binding var quantity: String
    @Binding var category: GroceryCategory
    @Binding var manualCategory: Bool
    @Binding var fullCatalogue: Bool
    let items: [Grocery]
    let preview: Bool
    let onAdd: (String, GroceryCategory) -> Void
    let onClose: () -> Void
    private var suggestions: [GrocerySuggestion] {
        if !GroceryCatalog.normalized(query).isEmpty {
            return Array(GroceryCatalog.suggestions(matching: query, custom: store.suggestions).prefix(80))
        }
        let common = ["Mjölk", "Ägg", "Smör", "Ost", "Yoghurt", "Bröd", "Knäckebröd", "Bananer", "Äpplen", "Tomater", "Gurka", "Potatis", "Morötter", "Gul lök", "Paprika", "Avokado", "Kycklingfilé", "Nötfärs", "Lax", "Pasta", "Ris", "Krossade tomater", "Kaffe", "Te", "Havregryn", "Toalettpapper", "Diskmedel", "Tvättmedel", "Tandkräm", "Glass", "Chips", "Choklad"]
        if fullCatalogue {
            return store.suggestions.sorted { $0.category == $1.category ? $0.id < $1.id : $0.category.sortOrder < $1.category.sortOrder }
        }
        let names = Set(GroceryCatalog.builtIn.map(\.id))
        let custom = store.suggestions.filter { !names.contains($0.id) }
        let activeItems = items.filter { !$0.checked }.map { GrocerySuggestion(name: $0.name, category: $0.category) }
        let commonItems = common.compactMap { name in store.suggestions.first(where: { $0.id == GroceryCatalog.normalized(name) }) }
        var seen = Set<String>()
        let candidates = (activeItems + custom + commonItems).filter { seen.insert($0.id).inserted }
        return GroceryCategory.allCases.flatMap { category in Array(candidates.filter { $0.category == category }.prefix(4)) }
    }
    var body: some View {
        VStack(spacing: 0) {
            if !query.isEmpty {
                VStack(spacing: 10) {
                    TextField("Mängd, t.ex. 2 l", text: $quantity).font(.subheadline).accessibilityLabel("Mängd för ny vara")
                    HStack {
                        Text("Kategori").font(.subheadline)
                        Spacer()
                        Picker("Kategori", selection: Binding(get: { category }, set: { category = $0; manualCategory = true })) {
                            ForEach(GroceryCategory.allCases) { value in Text(value.title).tag(value) }
                        }.tint(category.color).pickerStyle(.menu).accessibilityLabel("Kategori för ny vara")
                    }
                    Button("Lägg till vara") { onAdd(query, category) }.buttonStyle(.borderedProminent).tint(HandlaPalette.filledButton).frame(maxWidth: .infinity, alignment: .trailing)
                }.padding(.horizontal, 23).padding(.bottom, 12)
            }
            GeometryReader { suggestionsGeometry in
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text(fullCatalogue && query.isEmpty ? "Alla varor" : "Förslag").font(.subheadline).foregroundStyle(.secondary)
                        Spacer()
                        Button { fullCatalogue.toggle() } label: { Image(systemName: fullCatalogue ? "book.closed.fill" : "book") }
                            .accessibilityLabel(fullCatalogue ? "Visa vanliga varor" : "Visa hela varukatalogen")
                    }
                    ChipLayout(spacing: 7) {
                        ForEach(suggestions) { suggestion in
                            Button { onAdd(suggestion.name, manualCategory ? category : suggestion.category) } label: {
                                HStack(spacing: 5) {
                                    Text(suggestion.name).font(.system(size: 15, weight: .medium))
                                    if items.contains(where: { GroceryCatalog.normalized($0.name) == suggestion.id && !$0.checked }) {
                                        Image(systemName: "checkmark").font(.system(size: 12, weight: .semibold))
                                    }
                                }.foregroundStyle(.primary).padding(.horizontal, 10).padding(.vertical, 8)
                                    .background(suggestion.category.chipBackground, in: RoundedRectangle(cornerRadius: 8))
                                    .overlay { RoundedRectangle(cornerRadius: 8).strokeBorder(suggestion.category.color.opacity(0.5), lineWidth: 1) }
                            }.buttonStyle(.plain).accessibilityLabel("Lägg till \(suggestion.name)")
                        }
                    }
                    if suggestions.isEmpty { Text("Tryck på Lägg till vara för att lägga till \(query).").font(.subheadline).foregroundStyle(.secondary) }
                    if preview && showPreviewWatermark { Text("Förhandsvisning · exempeldata").font(.caption2).foregroundStyle(.tertiary).padding(.top, 16) }
                    Color.clear.frame(maxWidth: .infinity).frame(minHeight: 220).contentShape(Rectangle())
                        .onTapGesture { onClose() }
                }.frame(maxWidth: .infinity, minHeight: suggestionsGeometry.size.height, alignment: .topLeading).padding(.horizontal, 23).padding(.top, 3)
            }.scrollDismissesKeyboard(.interactively)
            }
        }
        .background(Color(uiColor: .systemBackground)).tint(handlaBlue).toolbar(.hidden, for: .navigationBar)
    }
}

private struct GroceryEditor: View {
    @Environment(\.dismiss) private var dismiss
    let onSave: (String, String, GroceryCategory) throws -> Void
    let createdAt: Date?
    let checkedAt: Date?
    let preview: Bool
    @State private var name: String
    @State private var quantity: String
    @State private var category: GroceryCategory
    @State private var error: String?
    init(item: Grocery, preview: Bool = false, onSave: @escaping (String, String, GroceryCategory) throws -> Void) {
        self.preview = preview
        self.createdAt = item.createdAt; self.checkedAt = item.checkedAt
        self.onSave = onSave; _name = State(initialValue: item.name); _quantity = State(initialValue: item.quantity); _category = State(initialValue: item.category)
    }
    var body: some View {
        NavigationStack {
            Form {
                Section("Vara") { TextField("Namn", text: $name); HStack { Text("Mängd"); TextField("Till exempel 2 l", text: $quantity).multilineTextAlignment(.trailing) } }
                Section("Kategori") { Picker("Kategori", selection: $category) { ForEach(GroceryCategory.allCases) { value in Text(value.title).tag(value) } } }
                if preview && showPreviewWatermark { Text("Förhandsvisning · exempeldata").font(.caption).foregroundStyle(.secondary) }
                Section("Datum") {
                    LabeledContent("Tillagd", value: createdAt?.formatted(date: .abbreviated, time: .shortened) ?? "Datum saknas")
                    LabeledContent("Senast avbockad", value: checkedAt?.formatted(date: .abbreviated, time: .shortened) ?? "Datum saknas")
                }
                if let error { Text(error).foregroundStyle(.red) }
            }.navigationTitle("Ändra vara").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Avbryt") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Spara") {
                            do { try onSave(name, quantity, category); dismiss() } catch { self.error = error.localizedDescription }
                        }.disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
        }
    }
}

private struct DashedDivider: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path(); path.move(to: CGPoint(x: rect.minX, y: rect.midY)); path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY)); return path
    }
    func sizeThatFits(_ proposal: ProposedViewSize) -> CGSize { CGSize(width: proposal.width ?? 0, height: 1) }
}

private struct ChipLayout: Layout {
    var spacing: CGFloat = 7
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        layout(width: proposal.width ?? 350, subviews: subviews).size
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = layout(width: bounds.width, subviews: subviews)
        for (index, point) in result.points.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + point.x, y: bounds.minY + point.y), proposal: .unspecified)
        }
    }
    private func layout(width: CGFloat, subviews: Subviews) -> (size: CGSize, points: [CGPoint]) {
        var points: [CGPoint] = [], x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > width { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            points.append(CGPoint(x: x, y: y)); x += size.width + spacing; rowHeight = max(rowHeight, size.height)
        }
        return (CGSize(width: width, height: y + rowHeight), points)
    }
}

private enum ShoppingExamples {
    static let lists = [ShoppingList(id: "week", name: "Veckohandling"), ShoppingList(id: "weekend", name: "Till helgen"), ShoppingList(id: "cabin", name: "Sommarstugan"), ShoppingList(id: "picnic", name: "Utflykten"), ShoppingList(id: "home", name: "Till hemmet")]
    static let items: [String: [Grocery]] = [
        "week": [
            Grocery(id: "banana", name: "Bananer", quantity: "6 st", checked: false, category: .produce),
            Grocery(id: "cucumber", name: "Gurka", quantity: "1 st", checked: false, category: .produce),
            Grocery(id: "milk", name: "Mjölk", quantity: "2 l", checked: false, category: .dairy),
            Grocery(id: "pasta", name: "Pasta", quantity: "500 g", checked: false, category: .pantry),
            Grocery(id: "bread", name: "Bröd", quantity: "1 st", checked: true, category: .bakery, createdAt: Date().addingTimeInterval(-172800), checkedAt: Date().addingTimeInterval(-3600)),
            Grocery(id: "coffee", name: "Kaffe", quantity: "1 pkt", checked: true, category: .drinks, createdAt: Date().addingTimeInterval(-604800), checkedAt: Date().addingTimeInterval(-172800)),
            Grocery(id: "eggs", name: "Ägg", quantity: "12 st", checked: true, category: .dairy)
        ],
        "weekend": [Grocery(id: "salmon", name: "Lax", quantity: "600 g", checked: false, category: .fish), Grocery(id: "potato", name: "Potatis", quantity: "1 kg", checked: false, category: .produce), Grocery(id: "cream", name: "Crème fraiche", quantity: "2 dl", checked: false, category: .dairy)],
        "picnic": [Grocery(id: "juice", name: "Juice", quantity: "1 l", checked: false, category: .drinks), Grocery(id: "apples", name: "Äpplen", quantity: "4 st", checked: false, category: .produce)],
        "home": [Grocery(id: "detergent", name: "Tvättmedel", quantity: "1 pkt", checked: false, category: .household), Grocery(id: "toothpaste", name: "Tandkräm", quantity: "1 st", checked: false, category: .hygiene)],
        "cabin": [Grocery(id: "paper", name: "Toalettpapper", quantity: "1 pkt", checked: false, category: .household), Grocery(id: "soap", name: "Diskmedel", quantity: "1 st", checked: false, category: .household)]
    ]
}

private var showPreviewWatermark: Bool {
    #if DEBUG
    !ProcessInfo.processInfo.arguments.contains("--app-store-screenshots")
    #else
    true
    #endif
}
