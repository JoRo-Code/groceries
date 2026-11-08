#if DEBUG
import Foundation
import FirebaseAuth
import FirebaseCore
import FirebaseFirestore

/// Explicit emulator-only SDK regression; never compiled into the App Store build.
@MainActor
enum NativeDeletionQA {
    static var started = false
    static func run(store: Store) async {
        guard !started, ProcessInfo.processInfo.arguments.contains("--qa-deletion-emulator"),
              FirebaseApp.app()?.options.projectID == "demo-handla" else { return }
        started = true
        let pushData = ProcessInfo.processInfo.arguments.contains("--qa-push-data")
        var report: [String: Any] = ["productionWrites": false, "project": "demo-handla", "pushDataEnabled": pushData]
        do {
            try? await store.signOut()
            let email = "native-delete-\(UUID().uuidString.lowercased())@example.test"
            let password = "Disposable-test-428!"
            try await store.authenticate(email: email, password: password, creatingAccount: true)
            try await settle { store.signedIn && !store.loading }
            try await store.createWorkspace("Native deletion QA")
            try await settle { store.workspaceID != nil }
            let db = Firestore.firestore()
            let plan = try await store.prepareAccountDeletion()
            guard let workspaceID = plan.workspaceID else { throw HandlaError.message("QA workspace missing") }
            report["userID"] = plan.userID; report["workspaceID"] = workspaceID
            guard plan.owner, plan.successorID == nil else { throw HandlaError.message("QA solo plan incorrect") }
            // Shared list ordering and validated notification routing, using native SDK calls.
            guard let initialList = store.lists.first else { throw HandlaError.message("QA initial list absent") }
            try store.addList("Zeta native QA")
            try await db.waitForPendingWrites()
            try await settle { store.lists.first?.name == "Zeta native QA" }
            try store.rememberViewedList(initialList.id)
            try await db.waitForPendingWrites()
            let remembered = try await db.collection("users").document(plan.userID).getDocument(source: .server)
            guard remembered.get("lastViewedListID") as? String == initialList.id, store.lists.first?.name == "Zeta native QA" else { throw HandlaError.message("QA private viewed list changed shared ranking") }
            report["sharedChangedOrderAndPrivateViewedPreference"] = true
            try store.addItem("Native actor QA", quantity: "2", category: .dairy, listID: initialList.id)
            try await db.waitForPendingWrites()
            let actorItems = try await store.itemsRef(initialList.id)!.whereField("name", isEqualTo: "Native actor QA").getDocuments(source: .server)
            guard let actorItem = actorItems.documents.first else { throw HandlaError.message("QA item missing") }
            guard (actorItem.get("lastActorUID") as? String) == (pushData ? plan.userID : nil) else { throw HandlaError.message("QA actor feature gate mismatch") }
            try store.setItemChecked(actorItem.documentID, checked: true, listID: initialList.id)
            try await db.waitForPendingWrites()
            let checkedItem = try await actorItem.reference.getDocument(source: .server)
            guard checkedItem.get("checked") as? Bool == true, (checkedItem.get("lastActorUID") as? String) == (pushData ? plan.userID : nil) else { throw HandlaError.message("QA checked marker missing") }
            report["nativeActorMarkerGateVerified"] = true
            PushNotifications.shared.start(store: store)
            let route: [AnyHashable: Any] = ["eventID": "native-qa-valid", "type": "itemAdded", "recipientUID": plan.userID, "workspaceID": workspaceID, "listID": initialList.id]
            await PushNotifications.shared.open(route)
            guard PushNotifications.shared.validatedEventForQA == "native-qa-valid" else { throw HandlaError.message("QA validated list routing failed") }
            var wrong = route; wrong["eventID"] = "native-qa-wrong-user"; wrong["recipientUID"] = "another-user"
            await PushNotifications.shared.open(wrong)
            guard PushNotifications.shared.validatedEventForQA == "native-qa-valid" else { throw HandlaError.message("QA wrong user notification accepted") }
            wrong = route; wrong["eventID"] = "native-qa-wrong-household"; wrong["workspaceID"] = "another-household"
            await PushNotifications.shared.open(wrong)
            guard PushNotifications.shared.validatedEventForQA == "native-qa-valid" else { throw HandlaError.message("QA wrong household notification accepted") }
            report["notificationValidRouteAndAccountHouseholdIsolation"] = true
            if pushData {
            try await db.collection("users").document(plan.userID).collection("devices").document("qa-device-1234567890").setData(["token": "synthetic-emulator-token-no-delivery", "platform": "ios", "updatedAt": FieldValue.serverTimestamp()])
            report["deviceDocument"] = "qa-device-1234567890"
            }
            let list = db.collection("workspaces").document(workspaceID).collection("lists").document("qa-list")
            try await list.setData(["name": "Disposable list"])
            // More than one purge batch: verify bounded native pagination really continues.
            for start in stride(from: 0, to: 205, by: 100) {
                let batch = db.batch()
                for index in start..<min(start + 100, 205) {
                    batch.setData(["name": "QA vara \(index)", "quantity": "1", "category": "other", "checked": false, "createdAt": FieldValue.serverTimestamp(), "checkedAt": NSNull()], forDocument: list.collection("items").document("item-\(index)"))
                }
                try await batch.commit()
            }
            try await db.collection("workspaces").document(workspaceID).collection("products").document("qa-product").setData(["name": "QA vara", "category": "other"])
            try await store.createInvite()
            report["inviteToken"] = store.inviteURL?.lastPathComponent
            do {
                try await store.deleteAccount(plan: plan, password: "incorrect-password")
                throw HandlaError.message("QA incorrect password unexpectedly deleted account")
            } catch {
                guard Auth.auth().currentUser != nil,
                      try await db.collection("users").document(plan.userID).getDocument(source: .server).exists else { throw error }
                report["wrongPasswordPreservesData"] = true
            }
            try await store.deleteAccount(plan: plan, password: password)
            try await settle { Auth.auth().currentUser == nil }
            report["authDeleted"] = true
            report["status"] = "passed"
        } catch { report["status"] = "failed"; report["error"] = error.localizedDescription }
        let path = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("deletion-qa.json")
        try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]).write(to: path)
    }
    static func settle(_ condition: () -> Bool) async throws {
        for _ in 0..<100 { if condition() { return }; try await Task.sleep(for: .milliseconds(100)) }
        throw HandlaError.message("QA state timeout")
    }
}
#endif
