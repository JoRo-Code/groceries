import SwiftUI
import AuthenticationServices

struct AccountDeletionView: View {
    @EnvironmentObject private var store: Store
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @State private var plan: AccountDeletionPlan?
    @State private var loading = true
    @State private var confirmed = false
    @State private var password = ""
    @State private var failure: String?
    private var privacyURL: URL { URL(string: "https://groceries-ros.web.app/privacy")! }
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Radera konto").font(.title2.bold())
                    Text("Raderingen är permanent och kan inte ångras. Bekräfta med samma konto som du är inloggad med.")
                }
                if loading { ProgressView("Hämtar kontouppgifter…") }
                if let plan {
                    Section("Det här händer") {
                        Text(plan.explanation)
                        Text("Ditt namn, din e-postadress och ditt medlemskap tas bort från appens kontouppgifter. Sparade ändringar synkas innan raderingen börjar.").font(.footnote).foregroundStyle(.secondary)
                        Toggle("Jag vill radera mitt konto permanent", isOn: $confirmed)
                    }
                    if store.deletingAccount {
                        Section { ProgressView("Raderar kontot…"); Text("Låt appen vara öppen. Raderingen kan ta längre tid för ett stort hushåll.").font(.footnote) }
                    } else if store.deletionUsesApple {
                        Section("Bekräfta med Apple") {
                            Text("Nästa steg bekräftar din identitet och raderar kontot.").font(.footnote)
                            SignInWithAppleButton(.continue, onRequest: store.prepareApple) { result in
                                switch result {
                                case .success(let authorization): erase(plan, apple: authorization)
                                case .failure(let error):
                                    if (error as? ASAuthorizationError)?.code != .canceled { failure = "Apple-bekräftelsen kunde inte slutföras. Försök igen." }
                                }
                            }.signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
                                .frame(height: 48).disabled(!confirmed || store.busy)
                                .accessibilityLabel("Bekräfta med Apple och radera kontot")
                        }
                    } else if store.deletionUsesPassword {
                        Section("Bekräfta med lösenord") {
                            Text(store.accountEmail).font(.footnote).foregroundStyle(.secondary)
                            SecureField("Ditt nuvarande lösenord", text: $password).textContentType(.password)
                            Button("Radera mitt konto", role: .destructive) { erase(plan) }.disabled(!confirmed || password.isEmpty || store.busy)
                        }
                    } else {
                        Section {
                            Text("Kontots inloggningsmetod stöds inte av denna appversion. Raderingen har inte påbörjats.")
                        }
                    }
                }
                if let failure { Section { Text(failure).foregroundStyle(.red); if plan == nil { Button("Försök igen") { Task { await load() } } } } }
                Section { Link("Integritetspolicy", destination: privacyURL) }
            }
            .navigationTitle("Ditt konto").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Avbryt") { dismiss() }.disabled(store.deletingAccount) } }
            .disabled(store.deletingAccount)
        }
        .interactiveDismissDisabled(store.deletingAccount)
        .task { await load() }
    }
    private func load() async {
        loading = true; failure = nil; confirmed = false
        defer { loading = false }
        do { plan = try await store.prepareAccountDeletion() }
        catch { failure = "Kontouppgifterna kunde inte hämtas. Kontrollera internetanslutningen och försök igen." }
    }
    private func erase(_ plan: AccountDeletionPlan, apple: ASAuthorization? = nil) {
        failure = nil
        Task {
            do { try await store.deleteAccount(plan: plan, password: password, appleAuthorization: apple); dismiss() }
            catch { failure = error.localizedDescription; password = ""; confirmed = false; self.plan = nil }
        }
    }
}

struct AccountLinks: View {
    var body: some View {
        Link("Integritetspolicy", destination: URL(string: "https://groceries-ros.web.app/privacy")!)
        Link("Support", destination: URL(string: "https://groceries-ros.web.app/support")!)
    }
}
