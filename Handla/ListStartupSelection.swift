import Foundation

/// Reconcile a cached initial choice once; later server updates must not move the reader.
struct ListStartupSelection {
    private(set) var resolved = false
    var interacted = false

    mutating func reconcile(current: String?, preferred: String?, available: [String], serverReady: Bool) -> String? {
        guard !resolved, serverReady else { return current }
        resolved = true
        guard !interacted else { return current }
        return preferred.flatMap { available.contains($0) ? $0 : nil } ?? available.first
    }
}
