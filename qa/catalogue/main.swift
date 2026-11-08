import Foundation

var passed = 0
func check(_ title: String, _ condition: @autoclosure () -> Bool) {
    guard condition() else { fatalError("FAIL: \(title)") }
    passed += 1
    print("PASS: \(title)")
}

check("at least 120 built-in groceries", GroceryCatalog.builtIn.count >= 120)
check("built-in normalized names unique", Set(GroceryCatalog.builtIn.map(\.id)).count == GroceryCatalog.builtIn.count)
check("all practical categories represented", Set(GroceryCatalog.builtIn.map(\.category)).count == GroceryCategory.allCases.count - 1)
check("case, accents, width and whitespace normalize", GroceryCatalog.normalized("  CRÈME\n  FRAICHE ") == "creme fraiche" && GroceryCatalog.normalized("ＭＪÖＬＫ") == "mjolk")
check("legacy milk category inferred without accents", GroceryCatalog.category(for: "MJOLK") == .dairy)
check("unknown legacy food remains other", GroceryCatalog.category(for: "Hemlig specialvara") == .other)
let milk = GroceryCatalog.suggestions(matching: "mjölk")
check("prefix ranks ahead of substring", milk.first?.name == "Mjölk" && milk.contains(where: { $0.name == "Laktosfri mjölk" }))
check("diacritic insensitive search matches eggs", GroceryCatalog.suggestions(matching: "agg").contains { $0.name == "Ägg" })
let customs = [GrocerySuggestion(name: " MJÖLK ", category: .other), GrocerySuggestion(name: "Min müsli", category: .pantry), GrocerySuggestion(name: "", category: .other)]
let merged = GroceryCatalog.merged(custom: customs)
check("custom entry overrides default spelling and category", merged.first(where: { $0.id == "mjolk" }) == GrocerySuggestion(name: "MJÖLK", category: .other))
check("merged results contain exactly one name", merged.filter { $0.id == "mjolk" }.count == 1)
check("new custom products searchable", GroceryCatalog.suggestions(matching: "musli", custom: customs).contains { $0.name == "Min müsli" })
check("empty custom products ignored", !merged.contains { $0.name.isEmpty })
let duplicateCustoms = [GrocerySuggestion(name: "Mjölk", category: .drinks), GrocerySuggestion(name: "MJÖLK", category: .other)]
check("duplicates resolve regardless of snapshot ordering", GroceryCatalog.merged(custom: duplicateCustoms) == GroceryCatalog.merged(custom: duplicateCustoms.reversed()))
check("empty query returns deterministic complete catalogue", GroceryCatalog.suggestions(matching: "   ") == GroceryCatalog.builtIn)
check("merging already merged store suggestions is idempotent", GroceryCatalog.merged(custom: merged) == merged)
check("category IDs are stable and ordered", GroceryCategory.allCases.map(\.rawValue) == ["produce", "dairy", "meat", "fish", "bakery", "pantry", "frozen", "drinks", "snacks", "household", "hygiene", "other"])
let oldMilk = GroceryCatalog.StoredProduct(name: "Mjölk", category: nil, isCanonical: false)
let newMilk = GroceryCatalog.StoredProduct(name: "Mjölk", category: .produce, isCanonical: true)
check("canonical category edit beats inferred legacy category", GroceryCatalog.workspaceProducts([newMilk, oldMilk]).first?.category == .produce)
check("legacy duplicate resolution independent of snapshot order", GroceryCatalog.workspaceProducts([newMilk, oldMilk]) == GroceryCatalog.workspaceProducts([oldMilk, newMilk]))
let explicitLegacy = GroceryCatalog.StoredProduct(name: "Mjölk", category: .drinks, isCanonical: false)
check("explicit legacy category beats inferred legacy category", GroceryCatalog.workspaceProducts([explicitLegacy, oldMilk]).first?.category == .drinks)
print("\(passed) catalogue checks passed; \(GroceryCatalog.builtIn.count) built-in products.")
