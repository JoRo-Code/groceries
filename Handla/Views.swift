import SwiftUI
import AuthenticationServices
import FirebaseFirestore

struct RootView: View {
    @EnvironmentObject private var store: Store
    @State private var name = ""
    @State private var link = ""
    @Environment(\.scenePhase) private var scenePhase
    private var shoppingPreview: Bool {
        #if DEBUG
        ["--preview-shopping", "--preview-lists", "--preview-add"].contains(where: ProcessInfo.processInfo.arguments.contains)
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
                        Button("Logga ut") { do { try store.signOut() } catch { store.error = error.localizedDescription } }.disabled(store.busy)
                    }.navigationTitle("Handla")
                } else { ListsView() }
            }
        }
        .id(store.sessionID)
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await store.loadPendingInvite() } }
        }
        .sheet(item: $store.invitation, onDismiss: store.dismissInvite) { invite in
            VStack(spacing: 24) {
                Image(systemName: "person.2.fill").font(.largeTitle).foregroundStyle(.indigo)
                Text("Välkommen till \(invite.name)").font(.title.bold()).multilineTextAlignment(.center)
                Text("Ni delar alla inköpslistor och sparade varor i hushållet.").multilineTextAlignment(.center)
                Button("Anslut till hushållet") { store.perform { try await store.join(invite) } }
                    .buttonStyle(.borderedProminent).disabled(store.busy)
                Button("Inte nu") { store.dismissInvite() }.disabled(store.busy)
                if let error = store.error { Text(error).foregroundStyle(.red).font(.caption) }
            }.padding(32).presentationDetents([.medium, .large]).interactiveDismissDisabled(store.busy)
        }
        .alert("Kunde inte slutföra", isPresented: Binding(get: { store.error != nil && store.invitation == nil }, set: { if !$0 { store.error = nil } })) {
            Button("OK") { store.error = nil }
        } message: { Text(store.error ?? "") }
    }
}

struct SignInView: View {
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
                }.buttonStyle(.borderedProminent)
                    .disabled(store.busy || email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || password.isEmpty)
                if !creatingAccount {
                    Button("Glömt lösenordet?") {
                        store.perform { try await store.sendPasswordReset(email: email); resetSent = true }
                    }.disabled(store.busy)
                }
                HStack { Rectangle().frame(height: 1); Text("eller").font(.caption); Rectangle().frame(height: 1) }.foregroundStyle(.tertiary)
                SignInWithAppleButton(.continue, onRequest: store.prepareApple, onCompletion: store.finishApple)
                    .frame(height: 50).clipShape(RoundedRectangle(cornerRadius: 12)).disabled(store.busy)
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
                    showAddInitially: showAddInitially, onShowLists: { showingOverview = true })
                    .id(selected.id)
            }
        }
        .background(Color(uiColor: .systemBackground))
        .toolbar(.hidden, for: .navigationBar)
    }
}

struct WorkspaceView: View {
    @EnvironmentObject private var store: Store
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            Form {
                Section("Hushåll") {
                    Label(store.workspaceName, systemImage: "house.fill")
                    Text("\(store.memberCount) \(store.memberCount == 1 ? "medlem" : "medlemmar")").foregroundStyle(.secondary)
                    Text("Alla medlemmar kan lägga till varor, bocka av och skapa listor.").foregroundStyle(.secondary)
                }
                if store.owner {
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
                Button("Logga ut") { do { try store.signOut(); dismiss() } catch { store.error = error.localizedDescription } }.disabled(store.busy)
            }.navigationTitle("Ert hushåll").toolbar { Button("Klart") { dismiss() } }
        }
    }
}

private extension GroceryCategory {
    var color: Color {
        switch self {
        case .produce: Color(red: 0.35, green: 0.66, blue: 0.25)
        case .dairy: Color(red: 0.30, green: 0.63, blue: 0.86)
        case .meat: Color(red: 0.84, green: 0.32, blue: 0.37)
        case .fish: Color(red: 0.25, green: 0.68, blue: 0.70)
        case .bakery: Color(red: 0.85, green: 0.63, blue: 0.29)
        case .pantry: Color(red: 0.91, green: 0.72, blue: 0.25)
        case .frozen: Color(red: 0.45, green: 0.55, blue: 0.84)
        case .drinks: Color(red: 0.64, green: 0.43, blue: 0.73)
        case .snacks: Color(red: 0.91, green: 0.48, blue: 0.29)
        case .household: Color(red: 0.52, green: 0.58, blue: 0.65)
        case .hygiene: Color(red: 0.84, green: 0.48, blue: 0.65)
        case .other: Color(red: 0.64, green: 0.64, blue: 0.62)
        }
    }
}

private let handlaBlue = Color(red: 0.02, green: 0.55, blue: 0.95)

@MainActor
private final class GroceryObservation: ObservableObject {
    @Published var items: [Grocery] = []
    @Published var loading = true
    @Published var pending = false
    @Published var fromCache = false
    private var listener: ListenerRegistration?
    private var observationID = UUID()
    func start(store: Store, listID: String) {
        stop(); loading = true
        let id = observationID, session = store.sessionID
        listener = store.itemsRef(listID)?.addSnapshotListener(includeMetadataChanges: true) { [weak self] snapshot, error in
            Task { @MainActor [weak self] in
                guard let self, self.observationID == id, store.sessionID == session else { return }
                self.loading = false
                if let error { store.error = error.localizedDescription; return }
                self.items = (snapshot?.documents ?? []).map { document in
                    let name = document.get("name") as? String ?? ""
                    let category = (document.get("category") as? String).flatMap(GroceryCategory.init(rawValue:)) ?? GroceryCatalog.category(for: name)
                    return Grocery(id: document.documentID, name: name, quantity: document.get("quantity") as? String ?? "", checked: document.get("checked") as? Bool ?? false, category: category)
                }
                self.pending = snapshot?.metadata.hasPendingWrites ?? false
                self.fromCache = snapshot?.metadata.isFromCache ?? false
            }
        }
    }
    func stop() { listener?.remove(); listener = nil; observationID = UUID() }
}

struct ItemsView: View {
    @EnvironmentObject private var store: Store
    let list: ShoppingList
    let listCount: Int
    let preview: Bool
    @Binding var exampleItems: [Grocery]
    let onShowLists: () -> Void
    @StateObject private var observation = GroceryObservation()
    @State private var adding: Bool
    @State private var editing: Grocery?
    @State private var showingWorkspace = false

    init(list: ShoppingList, listCount: Int, preview: Bool, exampleItems: Binding<[Grocery]>, showAddInitially: Bool = false, onShowLists: @escaping () -> Void) {
        self.list = list; self.listCount = listCount; self.preview = preview
        _exampleItems = exampleItems; self.onShowLists = onShowLists
        _adding = State(initialValue: showAddInitially)
    }
    private var items: [Grocery] { preview ? exampleItems : observation.items }
    private var active: [Grocery] { ordered(items.filter { !$0.checked }) }
    private var bought: [Grocery] { ordered(items.filter(\.checked)) }
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button(action: onShowLists) {
                    ZStack {
                        Image(systemName: "square.on.square").font(.system(size: 25, weight: .light))
                        Text("\(listCount)").font(.system(size: 12, weight: .medium)).offset(x: 3, y: 2)
                    }.frame(width: 44, height: 44)
                }.accessibilityLabel("Mina listor, \(listCount) listor")
                Spacer()
                Button { showingWorkspace = true } label: {
                    Image(systemName: "person.2").font(.system(size: 24, weight: .light)).frame(width: 44, height: 44)
                }.accessibilityLabel("Hushållets medlemmar")
                Menu {
                    Button("Mina listor", systemImage: "list.bullet") { onShowLists() }
                    Button("Ert hushåll", systemImage: "person.2") { showingWorkspace = true }
                } label: {
                    Image(systemName: "ellipsis").font(.system(size: 25, weight: .medium)).frame(width: 44, height: 44)
                }.accessibilityLabel("Fler alternativ")
            }.foregroundStyle(handlaBlue).padding(.horizontal, 14).padding(.top, 3)
            GeometryReader { geometry in
                ScrollView {
                    VStack(spacing: 0) {
                        VStack(alignment: .leading, spacing: 16) {
                            Text(list.name).font(.system(size: 36, weight: .bold)).tracking(-0.8)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Button { adding = true } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: "plus").font(.system(size: 21, weight: .light))
                                    Text("Ny vara").font(.system(size: 19))
                                    Spacer()
                                }.foregroundStyle(.secondary).padding(.horizontal, 15).frame(height: 51)
                                    .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
                            }.accessibilityLabel("Ny vara")
                        }.padding(.horizontal, 23).padding(.top, 15).padding(.bottom, 19)
                        if !preview && observation.loading {
                            ProgressView().padding(24)
                        } else if items.isEmpty {
                            Text("Lägg till det ni behöver handla.").foregroundStyle(.secondary).padding(.top, 26)
                        }
                        VStack(spacing: 0) { ForEach(active) { item in groceryRow(item) } }
                        Spacer(minLength: bought.isEmpty ? 32 : 80)
                        if !bought.isEmpty {
                            VStack(spacing: 0) {
                                DashedDivider().stroke(style: StrokeStyle(lineWidth: 0.7, dash: [2, 3])).frame(height: 1).foregroundStyle(Color.gray.opacity(0.22))
                                ForEach(bought) { item in groceryRow(item) }
                                Spacer(minLength: 12)
                            }
                            .frame(minHeight: geometry.size.height * 0.28, alignment: .top)
                            .background(Color(uiColor: .secondarySystemBackground).opacity(0.75))
                        }
                        if !preview && (observation.pending || observation.fromCache) {
                            Text(observation.pending ? "Väntar på synkning…" : "Visar sparad lista")
                                .font(.caption).foregroundStyle(.secondary).padding(10)
                        }
                        if preview {
                            Text("Förhandsvisning · exempeldata").font(.caption2).foregroundStyle(.tertiary).padding(7)
                        }
                    }.frame(minHeight: geometry.size.height, alignment: .top)
                }.scrollIndicators(.hidden)
            }
        }
        .background(Color(uiColor: .systemBackground))
        .toolbar(.hidden, for: .navigationBar)
        .tint(handlaBlue)
        .navigationDestination(isPresented: $adding) {
            AddGroceriesView(list: list, preview: preview, exampleItems: $exampleItems)
        }
        .sheet(item: $editing) { item in
            GroceryEditor(item: item) { name, quantity, category in
                if preview {
                    guard let index = exampleItems.firstIndex(where: { $0.id == item.id }) else { return }
                    let current = exampleItems[index]
                    exampleItems[index] = Grocery(id: current.id, name: name, quantity: quantity, checked: current.checked, category: category)
                } else { try store.updateItem(item.id, name: name, quantity: quantity, category: category, listID: list.id) }
            }.tint(handlaBlue)
        }
        .sheet(isPresented: $showingWorkspace) {
            if preview {
                NavigationStack {
                    ContentUnavailableView("Ert hushåll", systemImage: "person.2", description: Text("Här bjuder du in familjen i den riktiga appen."))
                        .toolbar { Button("Klart") { showingWorkspace = false } }
                }
            } else { WorkspaceView() }
        }
        .onAppear { if !preview { observation.start(store: store, listID: list.id) } }
        .onDisappear { observation.stop() }
    }
    private func groceryRow(_ item: Grocery) -> some View {
        HStack(spacing: 0) {
            Rectangle().fill(item.category.color.opacity(item.checked ? 0.3 : 1)).frame(width: 5)
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
        .overlay(alignment: .bottom) { DashedDivider().stroke(style: StrokeStyle(lineWidth: 0.7, dash: [2, 3])).frame(height: 1).padding(.leading, 24).foregroundStyle(Color.gray.opacity(0.27)) }
        .contextMenu {
            Button("Ändra vara", systemImage: "pencil") { editing = item }
            Button("Ta bort", systemImage: "trash", role: .destructive) { remove(item) }
        }
    }
    private func toggle(_ item: Grocery) {
        if preview {
            guard let index = exampleItems.firstIndex(where: { $0.id == item.id }) else { return }
            exampleItems[index] = Grocery(id: item.id, name: item.name, quantity: item.quantity, checked: !item.checked, category: item.category)
        } else {
            let session = store.sessionID
            store.itemsRef(list.id)?.document(item.id).updateData(["checked": !item.checked]) { error in
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
    private let colors: [Color] = [.teal, .black, .pink, .indigo, .orange]
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
                    .frame(width: 65, height: 65).background(handlaBlue, in: Circle()).shadow(color: .black.opacity(0.12), radius: 5, y: 3)
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
            .overlay(alignment: .bottom) { Rectangle().fill(Color.gray.opacity(0.18)).frame(height: 0.5) }
            .onAppear { if !preview { observation.start(store: store, listID: list.id) } }
            .onDisappear { observation.stop() }
    }
}

private struct AddGroceriesView: View {
    @EnvironmentObject private var store: Store
    @Environment(\.dismiss) private var dismiss
    let list: ShoppingList
    let preview: Bool
    @Binding var exampleItems: [Grocery]
    @StateObject private var observation = GroceryObservation()
    @State private var query = ""
    @State private var quantity = ""
    @State private var category: GroceryCategory = .other
    @State private var manualCategory = false
    @State private var fullCatalogue = false
    @FocusState private var focused: Bool
    private var items: [Grocery] { preview ? exampleItems : observation.items }
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
            HStack(spacing: 7) {
                Button { dismiss() } label: { Image(systemName: "chevron.left").font(.system(size: 24, weight: .light)).frame(width: 35, height: 44) }.accessibilityLabel("Tillbaka")
                HStack(spacing: 9) {
                    Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                    TextField("Ny vara", text: $query).focused($focused).submitLabel(.done).onSubmit { addTyped() }
                    if !query.isEmpty { Button { query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }.accessibilityLabel("Rensa sökning") }
                }.padding(.horizontal, 12).frame(height: 44).background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
                if !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Button { addTyped() } label: { Image(systemName: "plus.circle.fill").font(.system(size: 27)) }.accessibilityLabel("Lägg till vara")
                } else {
                    Button { fullCatalogue.toggle() } label: { Image(systemName: fullCatalogue ? "book.closed.fill" : "book").font(.system(size: 23)).frame(width: 35, height: 44) }
                        .accessibilityLabel(fullCatalogue ? "Visa vanliga varor" : "Visa hela varukatalogen")
                }
            }.padding(.horizontal, 12).padding(.top, 6).padding(.bottom, 10)
            if !query.isEmpty {
                HStack(spacing: 16) {
                    TextField("Mängd, t.ex. 2 l", text: $quantity).font(.subheadline).accessibilityLabel("Mängd för ny vara")
                    Picker("Kategori", selection: Binding(get: { category }, set: { category = $0; manualCategory = true })) {
                        ForEach(GroceryCategory.allCases) { value in Text(value.title).tag(value) }
                    }.tint(category.color).pickerStyle(.menu)
                }.padding(.horizontal, 23).padding(.bottom, 8)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text(fullCatalogue && query.isEmpty ? "Alla varor" : "Förslag").font(.subheadline).foregroundStyle(.secondary)
                    ChipLayout(spacing: 7) {
                        ForEach(suggestions) { suggestion in
                            Button { add(suggestion.name, category: suggestion.category) } label: {
                                HStack(spacing: 5) {
                                    Text(suggestion.name).font(.system(size: 15, weight: .medium))
                                    if items.contains(where: { GroceryCatalog.normalized($0.name) == suggestion.id && !$0.checked }) {
                                        Image(systemName: "checkmark").font(.system(size: 12, weight: .semibold))
                                    }
                                }.foregroundStyle(.primary).padding(.horizontal, 10).padding(.vertical, 8)
                                    .background(suggestion.category.color.opacity(0.48), in: RoundedRectangle(cornerRadius: 8))
                            }.buttonStyle(.plain).accessibilityLabel("Lägg till \(suggestion.name)")
                        }
                    }
                    if suggestions.isEmpty { Text("Tryck på plus för att lägga till \(query).").font(.subheadline).foregroundStyle(.secondary) }
                    if preview { Text("Förhandsvisning · exempeldata").font(.caption2).foregroundStyle(.tertiary).padding(.top, 16) }
                }.frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 20).padding(.top, 3)
            }.scrollDismissesKeyboard(.interactively)
        }
        .background(Color(uiColor: .systemBackground)).tint(handlaBlue).toolbar(.hidden, for: .navigationBar)
        .onChange(of: query) { _, value in
            if value.isEmpty { manualCategory = false; category = .other }
            else if !manualCategory { category = store.suggestions.first(where: { $0.id == GroceryCatalog.normalized(value) })?.category ?? GroceryCatalog.category(for: value) }
        }
        .onAppear {
            if !preview { observation.start(store: store, listID: list.id) }
            #if DEBUG
            if !ProcessInfo.processInfo.arguments.contains("--preview-hide-keyboard") { focused = true }
            #else
            focused = true
            #endif
        }
        .onDisappear { observation.stop() }
    }
    private func addTyped() { add(query, category: category) }
    private func add(_ rawName: String, category: GroceryCategory) {
        let name = rawName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        if let existing = items.first(where: { GroceryCatalog.normalized($0.name) == GroceryCatalog.normalized(name) }) {
            if existing.checked {
                if preview, let index = exampleItems.firstIndex(where: { $0.id == existing.id }) {
                    exampleItems[index] = Grocery(id: existing.id, name: existing.name, quantity: existing.quantity, checked: false, category: existing.category)
                } else {
                    let session = store.sessionID
                    store.itemsRef(list.id)?.document(existing.id).updateData(["checked": false]) { error in
                        Task { @MainActor in if store.sessionID == session, let error { store.error = error.localizedDescription } }
                    }
                }
            }
            return
        }
        do {
            if preview {
                guard name.count <= 120, quantity.count <= 80 else { throw HandlaError.message("Varunamnet eller mängden är för långt.") }
                exampleItems.append(Grocery(id: UUID().uuidString, name: name, quantity: quantity, checked: false, category: category))
            } else { try store.addItem(name, quantity: quantity, category: category, listID: list.id) }
            quantity = ""
        } catch { store.error = error.localizedDescription }
    }
}

private struct GroceryEditor: View {
    @Environment(\.dismiss) private var dismiss
    let onSave: (String, String, GroceryCategory) throws -> Void
    @State private var name: String
    @State private var quantity: String
    @State private var category: GroceryCategory
    @State private var error: String?
    init(item: Grocery, onSave: @escaping (String, String, GroceryCategory) throws -> Void) {
        self.onSave = onSave; _name = State(initialValue: item.name); _quantity = State(initialValue: item.quantity); _category = State(initialValue: item.category)
    }
    var body: some View {
        NavigationStack {
            Form {
                Section("Vara") { TextField("Namn", text: $name); HStack { Text("Mängd"); TextField("Till exempel 2 l", text: $quantity).multilineTextAlignment(.trailing) } }
                Section("Kategori") { Picker("Kategori", selection: $category) { ForEach(GroceryCategory.allCases) { value in Text(value.title).tag(value) } } }
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
    static let lists = [ShoppingList(id: "week", name: "Veckohandling"), ShoppingList(id: "weekend", name: "Till helgen"), ShoppingList(id: "cabin", name: "Sommarstugan")]
    static let items: [String: [Grocery]] = [
        "week": [
            Grocery(id: "banana", name: "Bananer", quantity: "6 st", checked: false, category: .produce),
            Grocery(id: "cucumber", name: "Gurka", quantity: "1 st", checked: false, category: .produce),
            Grocery(id: "milk", name: "Mjölk", quantity: "2 l", checked: false, category: .dairy),
            Grocery(id: "pasta", name: "Pasta", quantity: "500 g", checked: false, category: .pantry),
            Grocery(id: "bread", name: "Bröd", quantity: "1 st", checked: true, category: .bakery),
            Grocery(id: "coffee", name: "Kaffe", quantity: "1 pkt", checked: true, category: .drinks),
            Grocery(id: "eggs", name: "Ägg", quantity: "12 st", checked: true, category: .dairy)
        ],
        "weekend": [Grocery(id: "salmon", name: "Lax", quantity: "600 g", checked: false, category: .fish), Grocery(id: "potato", name: "Potatis", quantity: "1 kg", checked: false, category: .produce), Grocery(id: "cream", name: "Crème fraiche", quantity: "2 dl", checked: false, category: .dairy)],
        "cabin": [Grocery(id: "paper", name: "Toalettpapper", quantity: "1 pkt", checked: false, category: .household), Grocery(id: "soap", name: "Diskmedel", quantity: "1 st", checked: false, category: .household)]
    ]
}
