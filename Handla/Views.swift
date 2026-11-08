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
        ProcessInfo.processInfo.arguments.contains("--preview-shopping")
        #else
        false
        #endif
    }
    var body: some View {
        NavigationStack {
            Group {
                if shoppingPreview {
                    ItemsView(list: ShoppingList(id: "preview", name: "Veckohandling"), preview: true)
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
    @State private var newList = ""
    @State private var showNewList = false
    @State private var settings = false
    var body: some View {
        List {
            Section {
                Label(store.workspaceName, systemImage: "person.2.fill").foregroundStyle(.secondary)
            }
            Section("Era listor") {
                ForEach(store.lists) { list in
                    NavigationLink { ItemsView(list: list) } label: {
                        Label(list.name, systemImage: "list.bullet.rectangle").padding(.vertical, 8)
                    }
                }
                Button { showNewList = true } label: { Label("Ny inköpslista", systemImage: "plus.circle.fill") }
            }
            if store.listsPending {
                Text("Liständringar väntar på synkning.").font(.caption).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Handla")
        .toolbar { Button { settings = true } label: { Image(systemName: "person.crop.circle") }.accessibilityLabel("Hushållet") }
        .sheet(isPresented: $settings) { WorkspaceView() }
        .alert("Ny inköpslista", isPresented: $showNewList) {
            TextField("Listans namn", text: $newList)
            Button("Skapa") { let name = newList; store.perform { try store.addList(name); newList = "" } }.disabled(newList.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.busy)
            Button("Avbryt", role: .cancel) {}
        }
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

struct ItemsView: View {
    @EnvironmentObject private var store: Store
    let list: ShoppingList
    var preview = false
    @State private var items: [Grocery] = []
    @State private var listener: ListenerRegistration?
    @State private var name = ""
    @State private var quantity = ""
    @State private var category: GroceryCategory = .other
    @State private var manualCategory = false
    @State private var pending = false
    @State private var fromCache = false
    @State private var loading = true
    @State private var observationID = UUID()
    @State private var editing: Grocery?
    @State private var showMembers = false
    @State private var previewInitialized = false
    @FocusState private var nameFocused: Bool
    private let accent = Color(red: 0.79, green: 0.24, blue: 0.23)
    private var matches: [GrocerySuggestion] {
        guard nameFocused, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return [] }
        return Array(GroceryCatalog.suggestions(matching: name, custom: store.suggestions)
            .filter { $0.name.caseInsensitiveCompare(name) != .orderedSame }.prefix(5))
    }
    private var remaining: [Grocery] { orderedItems(checked: false) }
    private var bought: [Grocery] { orderedItems(checked: true) }
    private func orderedItems(checked: Bool) -> [Grocery] {
        items.filter { $0.checked == checked }.sorted {
            if $0.category.sortOrder != $1.category.sortOrder { return $0.category.sortOrder < $1.category.sortOrder }
            return $0.name.localizedStandardCompare($1.name) == .orderedAscending
        }
    }
    var body: some View {
        List {
            if preview {
                Text("Förhandsvisning · exempeldata")
                    .font(.caption).foregroundStyle(.secondary)
                    .listRowSeparator(.hidden)
            }
            if loading {
                ProgressView("Hämtar listan…").listRowSeparator(.hidden)
            } else if items.isEmpty {
                ContentUnavailableView("Vad behöver ni hemma?", systemImage: "basket", description: Text("Skriv en vara nedan. Vi hjälper dig att hitta den."))
                    .listRowSeparator(.hidden)
            } else {
                Section {
                    groceryRows(remaining)
                } header: {
                    HStack { Text("Att handla"); Spacer(); Text("\(remaining.count) kvar") }
                        .font(.subheadline).foregroundStyle(.secondary).textCase(nil)
                }
                if !bought.isEmpty {
                    Section {
                        groceryRows(bought)
                    } header: {
                        HStack(spacing: 6) {
                            Image(systemName: "checkmark")
                            Text("Köpt")
                            Spacer()
                            Text("\(bought.count)")
                        }.font(.subheadline).foregroundStyle(.secondary).textCase(nil).padding(.top, 14)
                    }
                }
            }
            if pending || fromCache {
                Text(pending ? "Ändringar väntar på synkning." : "Visar sparad lista. Synkas när anslutningen är tillbaka.")
                    .font(.caption).foregroundStyle(.secondary).listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .scrollDismissesKeyboard(.interactively)
        .background(Color(uiColor: .systemBackground))
        .navigationTitle(list.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { nameFocused = false; showMembers = true } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "person.2")
                        Text("\(preview ? 2 : store.memberCount)").font(.subheadline.weight(.medium))
                    }
                }.accessibilityLabel("Hushållets medlemmar, \(preview ? 2 : store.memberCount)")
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { composer }
        .tint(accent)
        .onChange(of: name) { _, value in
            if value.isEmpty { manualCategory = false; category = .other }
            else if !manualCategory {
                category = store.suggestions.first(where: { GroceryCatalog.normalized($0.name) == GroceryCatalog.normalized(value) })?.category ?? GroceryCatalog.category(for: value)
            }
        }
        .sheet(item: $editing) { item in
            GroceryEditor(item: item) { newName, newQuantity, newCategory in
                if preview {
                    replace(item, name: newName, quantity: newQuantity, category: newCategory, checked: item.checked)
                } else {
                    try store.updateItem(item.id, name: newName, quantity: newQuantity, category: newCategory, listID: list.id)
                }
            }.tint(accent)
        }
        .sheet(isPresented: $showMembers) {
            if preview {
                NavigationStack {
                    ContentUnavailableView("Handla tillsammans", systemImage: "person.2", description: Text("I appen finns hushållets medlemmar och inbjudningslänk här. Detta är en förhandsvisning med exempeldata."))
                        .navigationTitle("Ert hushåll")
                        .toolbar { Button("Klart") { showMembers = false } }
                }
            } else { WorkspaceView() }
        }
        .onAppear(perform: observe)
        .onDisappear { listener?.remove(); listener = nil; observationID = UUID() }
    }

    private var composer: some View {
        VStack(spacing: 0) {
            if !matches.isEmpty {
                VStack(spacing: 0) {
                    ForEach(matches) { suggestion in
                        Button {
                            name = suggestion.name
                            category = suggestion.category
                            manualCategory = false
                        } label: {
                            HStack(spacing: 10) {
                                Circle().fill(suggestion.category.color).frame(width: 9, height: 9)
                                Text(suggestion.name).foregroundStyle(.primary)
                                Spacer()
                                Text(suggestion.category.title).font(.caption).foregroundStyle(.secondary)
                                Image(systemName: "arrow.up.left").font(.caption).foregroundStyle(.tertiary)
                            }.padding(.horizontal, 18).frame(minHeight: 40).contentShape(Rectangle())
                        }.buttonStyle(.plain)
                    }
                }.padding(.vertical, 5)
                Divider()
            }
            HStack(spacing: 12) {
                TextField("Lägg till en vara…", text: $name)
                    .font(.body).focused($nameFocused).submitLabel(.done).onSubmit(add)
                    .accessibilityLabel("Varans namn")
                TextField("Mängd", text: $quantity)
                    .multilineTextAlignment(.trailing).frame(width: 65)
                    .accessibilityLabel("Mängd för ny vara")
                Button(action: add) {
                    Image(systemName: "plus.circle.fill").font(.system(size: 30))
                }.disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.busy)
                    .accessibilityLabel("Lägg till vara")
            }.padding(.horizontal, 16).padding(.top, 13).padding(.bottom, 10)
            if !name.isEmpty {
                HStack {
                    Menu {
                        Picker("Kategori", selection: Binding(get: { category }, set: { category = $0; manualCategory = true })) {
                            ForEach(GroceryCategory.allCases) { value in Text(value.title).tag(value) }
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Circle().fill(category.color).frame(width: 8, height: 8)
                            Text(category.title)
                            Image(systemName: "chevron.down").font(.caption2)
                        }.font(.caption).foregroundStyle(.secondary)
                    }.accessibilityLabel("Kategori: \(category.title)")
                    Spacer()
                }.padding(.horizontal, 18).padding(.bottom, 10)
            }
        }
        .background(Color(uiColor: .systemBackground))
        .overlay(alignment: .top) { Divider() }
    }

    @ViewBuilder private func groceryRows(_ groceries: [Grocery]) -> some View {
        ForEach(groceries) { item in
            HStack(spacing: 0) {
                Rectangle().fill(item.category.color.opacity(item.checked ? 0.35 : 1)).frame(width: 5)
                Button { toggle(item) } label: {
                    HStack(spacing: 10) {
                        Text(item.name)
                            .font(.title3)
                            .strikethrough(item.checked, color: .secondary)
                            .foregroundStyle(item.checked ? .secondary : .primary)
                            .multilineTextAlignment(.leading)
                        Spacer(minLength: 8)
                    }.padding(.leading, 14).padding(.vertical, 15).contentShape(Rectangle())
                }.buttonStyle(.plain)
                    .accessibilityLabel("\(item.name), \(item.category.title), \(item.checked ? "köpt" : "att handla")")
                    .accessibilityHint(item.checked ? "Tryck för att lägga tillbaka på listan." : "Tryck för att bocka av.")
                Button { nameFocused = false; editing = item } label: {
                    Text(item.quantity.isEmpty ? "Mängd" : item.quantity)
                        .font(.body).foregroundStyle(item.checked ? .tertiary : .secondary)
                        .strikethrough(item.checked, color: .secondary)
                        .frame(minWidth: 44, minHeight: 44, alignment: .trailing)
                        .contentShape(Rectangle())
                }.buttonStyle(.plain)
                    .accessibilityLabel("Ändra mängd för \(item.name), \(item.quantity.isEmpty ? "ingen mängd" : item.quantity)")
                    .padding(.trailing, 17)
            }
            .frame(minHeight: 56)
            .listRowInsets(EdgeInsets())
            .listRowSeparator(.hidden)
            .overlay(alignment: .bottom) {
                Rectangle().fill(Color.primary.opacity(0.09)).frame(height: 0.5).padding(.leading, 19)
            }
            .contextMenu {
                Button("Ändra vara", systemImage: "pencil") { editing = item }
                Button(item.checked ? "Lägg tillbaka" : "Bocka av", systemImage: item.checked ? "arrow.uturn.backward" : "checkmark") { toggle(item) }
                Button("Ta bort", systemImage: "trash", role: .destructive) { remove(item) }
            }
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                Button("Ta bort", role: .destructive) { remove(item) }
                Button("Ändra") { nameFocused = false; editing = item }.tint(.gray)
            }
        }
    }

    private func observe() {
        listener?.remove()
        if preview {
            #if DEBUG
            if !previewInitialized {
                previewInitialized = true
                items = Self.previewItems
                if ProcessInfo.processInfo.arguments.contains("--preview-suggestions") {
                    name = "mj"
                    nameFocused = true
                }
                if ProcessInfo.processInfo.arguments.contains("--preview-edit") {
                    Task { @MainActor in
                        await Task.yield()
                        editing = items.first(where: { $0.id == "milk" })
                    }
                }
            }
            #endif
            loading = false
            return
        }
        let session = store.sessionID
        let observation = UUID()
        observationID = observation
        loading = true
        listener = store.itemsRef(list.id)?.addSnapshotListener(includeMetadataChanges: true) { snapshot, error in
            Task { @MainActor in
                guard store.sessionID == session, observationID == observation else { return }
                loading = false
                if let error { store.error = error.localizedDescription; return }
                items = (snapshot?.documents ?? []).map {
                    let name = $0.get("name") as? String ?? ""
                    let category = ($0.get("category") as? String).flatMap(GroceryCategory.init(rawValue:)) ?? GroceryCatalog.category(for: name)
                    return Grocery(id: $0.documentID, name: name, quantity: $0.get("quantity") as? String ?? "", checked: $0.get("checked") as? Bool ?? false, category: category)
                }
                pending = snapshot?.metadata.hasPendingWrites ?? false
                fromCache = snapshot?.metadata.isFromCache ?? false
            }
        }
    }
    private func toggle(_ item: Grocery) {
        if preview {
            replace(item, name: item.name, quantity: item.quantity, category: item.category, checked: !item.checked)
            return
        }
        let session = store.sessionID
        store.itemsRef(list.id)?.document(item.id).updateData(["checked": !item.checked]) { error in
            Task { @MainActor in
                guard store.sessionID == session else { return }
                if let error { store.error = error.localizedDescription }
            }
        }
    }
    private func remove(_ item: Grocery) {
        if preview { items.removeAll { $0.id == item.id }; return }
        let session = store.sessionID
        store.itemsRef(list.id)?.document(item.id).delete { error in
            Task { @MainActor in
                guard store.sessionID == session else { return }
                if let error { store.error = error.localizedDescription }
            }
        }
    }
    private func replace(_ item: Grocery, name: String, quantity: String, category: GroceryCategory, checked: Bool) {
        guard let index = items.firstIndex(where: { $0.id == item.id }) else { return }
        items[index] = Grocery(id: item.id, name: name, quantity: quantity, checked: checked, category: category)
    }
    private func add() {
        let itemName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !itemName.isEmpty, !store.busy else { return }
        do {
            if preview {
                guard itemName.count <= 120, quantity.count <= 80 else { throw HandlaError.message("Ange ett kortare varunamn eller en kortare mängd.") }
                items.append(Grocery(id: UUID().uuidString, name: itemName, quantity: quantity, checked: false, category: category))
            } else {
                try store.addItem(itemName, quantity: quantity, category: category, listID: list.id)
            }
            name = ""; quantity = ""; category = .other; manualCategory = false; nameFocused = true
        } catch { store.error = error.localizedDescription }
    }
    #if DEBUG
    private static let previewItems = [
        Grocery(id: "banana", name: "Bananer", quantity: "6 st", checked: false, category: .produce),
        Grocery(id: "cucumber", name: "Gurka", quantity: "1 st", checked: false, category: .produce),
        Grocery(id: "tomato", name: "Tomater", quantity: "500 g", checked: false, category: .produce),
        Grocery(id: "milk", name: "Mjölk", quantity: "2 l", checked: false, category: .dairy),
        Grocery(id: "eggs", name: "Ägg", quantity: "12 st", checked: false, category: .dairy),
        Grocery(id: "pasta", name: "Pasta", quantity: "500 g", checked: false, category: .pantry),
        Grocery(id: "bread", name: "Bröd", quantity: "1 st", checked: true, category: .bakery),
        Grocery(id: "coffee", name: "Kaffe", quantity: "1 pkt", checked: true, category: .drinks)
    ]
    #endif
}

private struct GroceryEditor: View {
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var quantity: String
    @State private var category: GroceryCategory
    @State private var error: String?
    let onSave: (String, String, GroceryCategory) throws -> Void
    init(item: Grocery, onSave: @escaping (String, String, GroceryCategory) throws -> Void) {
        _name = State(initialValue: item.name)
        _quantity = State(initialValue: item.quantity)
        _category = State(initialValue: item.category)
        self.onSave = onSave
    }
    var body: some View {
        NavigationStack {
            Form {
                Section("Vara") {
                    TextField("Namn", text: $name)
                    HStack { Text("Mängd"); Spacer(); TextField("Exempelvis 2 l", text: $quantity).multilineTextAlignment(.trailing) }
                }
                Section("Kategori") {
                    Picker("Kategori", selection: $category) {
                        ForEach(GroceryCategory.allCases) { category in
                            Label { Text(category.title) } icon: { Circle().fill(category.color).frame(width: 10, height: 10) }.tag(category)
                        }
                    }.pickerStyle(.navigationLink)
                }
                if let error { Text(error).foregroundStyle(.red).font(.callout) }
            }
            .navigationTitle("Ändra vara")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Avbryt") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Spara") {
                        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !trimmed.isEmpty, trimmed.count <= 120, quantity.count <= 80 else {
                            error = "Ange ett varunamn på högst 120 tecken och en mängd på högst 80 tecken."; return
                        }
                        do { try onSave(trimmed, quantity, category); dismiss() }
                        catch { self.error = error.localizedDescription }
                    }.fontWeight(.semibold).disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}
