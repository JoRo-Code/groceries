import Foundation

/// Stable IDs are persisted in Firestore; display names can change independently.
enum GroceryCategory: String, CaseIterable, Identifiable, Codable {
    case produce, dairy, meat, fish, bakery, pantry, frozen, drinks, snacks, household, hygiene, other

    var id: String { rawValue }
    var sortOrder: Int { Self.allCases.firstIndex(of: self) ?? Self.allCases.count }
    var title: String {
        switch self {
        case .produce: return "Frukt & grönt"
        case .dairy: return "Mejeri & ägg"
        case .meat: return "Kött & fågel"
        case .fish: return "Fisk & skaldjur"
        case .bakery: return "Bröd & bageri"
        case .pantry: return "Skafferi"
        case .frozen: return "Fryst"
        case .drinks: return "Dryck"
        case .snacks: return "Godis & snacks"
        case .household: return "Hem & städ"
        case .hygiene: return "Hygien"
        case .other: return "Övrigt"
        }
    }
}

struct GrocerySuggestion: Identifiable, Equatable {
    let name: String
    let category: GroceryCategory
    var id: String { GroceryCatalog.normalized(name) }
}

enum GroceryCatalog {
    /// Fixed locale and collapsed whitespace keep matching independent of device settings.
    static func normalized(_ value: String) -> String {
        value.folding(options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive], locale: Locale(identifier: "sv_SE"))
            .lowercased(with: Locale(identifier: "sv_SE"))
            .split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }

    static let builtIn: [GrocerySuggestion] = {
        let groups: [(GroceryCategory, [String])] = [
            (.produce, [
                "Äpplen", "Bananer", "Apelsiner", "Päron", "Clementiner", "Citron", "Lime", "Grapefrukt",
                "Vindruvor", "Kiwi", "Mango", "Ananas", "Melon", "Vattenmelon", "Jordgubbar", "Blåbär",
                "Hallon", "Avokado", "Tomater", "Körsbärstomater", "Gurka", "Paprika", "Morötter", "Potatis",
                "Sötpotatis", "Gul lök", "Röd lök", "Vitlök", "Purjolök", "Salladslök", "Broccoli", "Blomkål",
                "Vitkål", "Rödkål", "Grönkål", "Spenat", "Isbergssallad", "Romansallad", "Ruccola", "Zucchini",
                "Aubergine", "Champinjoner", "Rödbetor", "Palsternacka", "Rotselleri", "Stjälkselleri",
                "Sparris", "Rädisor", "Ingefära", "Chili", "Dill", "Persilja", "Basilika", "Koriander", "Gräslök"
            ]),
            (.dairy, [
                "Mjölk", "Mellanmjölk", "Lättmjölk", "Standardmjölk", "Laktosfri mjölk", "Havredryck",
                "Sojadryck", "Mandeldryck", "Filmjölk", "Yoghurt", "Grekisk yoghurt", "Vaniljyoghurt", "Kvarg",
                "Keso", "Crème fraiche", "Gräddfil", "Vispgrädde", "Matlagningsgrädde", "Smör", "Margarin",
                "Ost", "Hushållsost", "Riven ost", "Parmesan", "Mozzarella", "Fetaost", "Halloumi", "Färskost", "Ägg"
            ]),
            (.meat, [
                "Kycklingfilé", "Kycklinglår", "Hel kyckling", "Nötfärs", "Blandfärs", "Fläskfärs", "Fläskfilé",
                "Fläskkotletter", "Bacon", "Falukorv", "Grillkorv", "Prinskorv", "Köttbullar", "Skinka",
                "Salami", "Leverpastej", "Rostbiff", "Entrecôte", "Högrev"
            ]),
            (.fish, [
                "Lax", "Laxfilé", "Torsk", "Sej", "Räkor", "Kräftor", "Musslor", "Sill", "Gravad lax",
                "Rökt lax", "Makrill", "Kaviar"
            ]),
            (.bakery, [
                "Bröd", "Rostbröd", "Formfranska", "Fullkornsbröd", "Surdegsbröd", "Baguette", "Frallor",
                "Knäckebröd", "Tunnbröd", "Tortillabröd", "Hamburgerbröd", "Korvbröd", "Pitabröd",
                "Skorpor", "Kanelbullar", "Croissanter"
            ]),
            (.pantry, [
                "Pasta", "Spaghetti", "Makaroner", "Lasagneplattor", "Ris", "Jasminris", "Bulgur", "Couscous",
                "Quinoa", "Nudlar", "Havregryn", "Müsli", "Granola", "Cornflakes", "Vetemjöl", "Rågmjöl",
                "Strösocker", "Florsocker", "Farinsocker", "Bakpulver", "Bikarbonat", "Vaniljsocker", "Jäst",
                "Kakao", "Ströbröd", "Potatismjöl", "Majsstärkelse", "Salt", "Flingsalt", "Svartpeppar",
                "Vitpeppar", "Paprikapulver", "Curry", "Spiskummin", "Kanel", "Oregano", "Timjan",
                "Tacokrydda", "Olivolja", "Rapsolja", "Vinäger", "Balsamvinäger", "Soja", "Ketchup",
                "Senap", "Majonnäs", "Chilisås", "Sriracha", "Pesto", "Salsa", "Tomatpuré", "Krossade tomater",
                "Passerade tomater", "Kokosmjölk", "Kokosgrädde", "Grönsaksbuljong", "Kycklingbuljong",
                "Köttbuljong", "Majs", "Kikärtor", "Kidneybönor", "Svarta bönor", "Vita bönor", "Röda linser",
                "Gröna linser", "Tonfisk", "Oliver", "Kapris", "Soltorkade tomater", "Inlagd gurka", "Äppelmos",
                "Sylt", "Marmelad", "Honung", "Sirap", "Jordnötssmör", "Russin", "Torkade aprikoser",
                "Solrosfrön", "Pumpafrön", "Chiafrön", "Linfrön", "Kokosflingor", "Tofu"
            ]),
            (.frozen, [
                "Frysta ärtor", "Fryst broccoli", "Fryst spenat", "Frysta grönsaker", "Wokgrönsaker",
                "Frysta bär", "Frysta hallon", "Frysta blåbär", "Fryst mango", "Pommes frites", "Fiskpinnar",
                "Fryst pizza", "Glass", "Vegofärs", "Vegetariska bullar", "Falafel", "Smördeg"
            ]),
            (.drinks, [
                "Kaffe", "Bryggkaffe", "Kaffebönor", "Snabbkaffe", "Te", "Grönt te", "Apelsinjuice",
                "Äppeljuice", "Saft", "Mineralvatten", "Kolsyrat vatten", "Läsk", "Cola", "Alkoholfri öl"
            ]),
            (.snacks, [
                "Chips", "Popcorn", "Ostbågar", "Tortillachips", "Salta pinnar", "Jordnötter", "Cashewnötter",
                "Mandlar", "Valnötter", "Choklad", "Mörk choklad", "Godis", "Lakrits", "Kex", "Kakor", "Riskakor"
            ]),
            (.household, [
                "Toalettpapper", "Hushållspapper", "Servetter", "Diskmedel", "Diskmaskinstabletter",
                "Diskborste", "Disksvampar", "Disktrasor", "Tvättmedel", "Sköljmedel", "Allrengöring",
                "Såpa", "Fönsterputs", "Toalettrengöring", "Soppåsar", "Fryspåsar", "Bakplåtspapper",
                "Aluminiumfolie", "Plastfolie", "Kaffefilter", "Batterier", "Värmeljus", "Tändstickor",
                "Hundmat", "Kattmat", "Kattsand"
            ]),
            (.hygiene, [
                "Handtvål", "Duschkräm", "Schampo", "Balsam", "Tandkräm", "Tandborste", "Tandtråd",
                "Munskölj", "Deodorant", "Hudkräm", "Handkräm", "Läppbalsam", "Solkräm", "Rakhyvlar",
                "Rakgel", "Bomullsrondeller", "Bomullspinnar", "Bindor", "Tamponger", "Blöjor", "Våtservetter"
            ])
        ]
        return groups.flatMap { category, names in names.map { GrocerySuggestion(name: $0, category: category) } }
            .sorted(by: alphabetical)
    }()

    private static let byName = Dictionary(uniqueKeysWithValues: builtIn.map { ($0.id, $0) })

    /// Existing documents without a category retain a sensible category when possible.
    static func category(for name: String) -> GroceryCategory {
        byName[normalized(name)]?.category ?? .other
    }

    struct StoredProduct {
        let name: String
        let category: GroceryCategory?
        let isCanonical: Bool
    }

    /// Older clients hashed unnormalized names. Prefer the current canonical document,
    /// then an explicit category, so a legacy inferred category cannot undo an edit.
    static func workspaceProducts(_ products: [StoredProduct]) -> [GrocerySuggestion] {
        let ordered = products.sorted { lhs, rhs in
            if lhs.isCanonical != rhs.isCanonical { return !lhs.isCanonical }
            if (lhs.category != nil) != (rhs.category != nil) { return lhs.category == nil }
            return alphabetical(
                GrocerySuggestion(name: lhs.name, category: lhs.category ?? category(for: lhs.name)),
                GrocerySuggestion(name: rhs.name, category: rhs.category ?? category(for: rhs.name)))
        }
        var selected: [String: GrocerySuggestion] = [:]
        for product in ordered {
            let name = product.name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty else { continue }
            selected[normalized(name)] = GrocerySuggestion(name: name, category: product.category ?? category(for: name))
        }
        return selected.values.sorted(by: alphabetical)
    }

    /// Custom workspace entries override the bundled spelling/category for a normalized name.
    /// Stable sorting makes results identical regardless of Firestore snapshot order.
    static func merged(custom: [GrocerySuggestion]) -> [GrocerySuggestion] {
        var entries = byName
        for product in custom.sorted(by: alphabetical) {
            let name = product.name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty else { continue }
            entries[normalized(name)] = GrocerySuggestion(name: name, category: product.category)
        }
        return entries.values.sorted(by: alphabetical)
    }

    /// Prefix matches precede substring matches; neither accents nor capitalization matter.
    static func suggestions(matching query: String, custom: [GrocerySuggestion] = []) -> [GrocerySuggestion] {
        let needle = normalized(query)
        let entries = merged(custom: custom)
        guard !needle.isEmpty else { return entries }
        return entries.filter { $0.id.contains(needle) }.sorted { lhs, rhs in
            let leftPrefix = lhs.id.hasPrefix(needle), rightPrefix = rhs.id.hasPrefix(needle)
            if leftPrefix != rightPrefix { return leftPrefix }
            return alphabetical(lhs, rhs)
        }
    }

    private static func alphabetical(_ lhs: GrocerySuggestion, _ rhs: GrocerySuggestion) -> Bool {
        if lhs.id != rhs.id { return lhs.id < rhs.id }
        if lhs.name != rhs.name { return lhs.name < rhs.name }
        return lhs.category.sortOrder < rhs.category.sortOrder
    }
}
