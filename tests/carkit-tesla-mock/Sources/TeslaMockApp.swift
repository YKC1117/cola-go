import SwiftUI
import AppIntents

struct VehicleEntity: AppEntity, Identifiable, Hashable {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Tesla Vehicle"
    static let defaultQuery = VehicleQuery()

    let id: String
    let name: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)")
    }
}

// Use EntityStringQuery for the mock because Apple documents this as the query
// used when people configure an AppEntity parameter in Shortcuts: initial
// choices come from suggestedEntities(), and typed search uses entities(matching:).
// EntityQuery alone should already support suggestedEntities(), but this stronger
// conformance removes "missing searchable picker support" as a test-double variable.
struct VehicleQuery: EntityStringQuery {
    private let all = [
        VehicleEntity(id: "mock-a", name: "測試車 A"),
        VehicleEntity(id: "mock-b", name: "測試車 B"),
    ]

    func entities(for identifiers: [VehicleEntity.ID]) async throws -> [VehicleEntity] {
        all.filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [VehicleEntity] {
        all
    }

    func entities(matching string: String) async throws -> [VehicleEntity] {
        let query = string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return all }
        return all.filter { $0.name.localizedCaseInsensitiveContains(query) }
    }
}

struct FrontTrunkIntent: AppIntent {
    static let title: LocalizedStringResource = "Open Front Trunk"
    static let description = IntentDescription("CarKit test-only mock Tesla intent.")
    static let openAppWhenRun = false

    @Parameter(title: "Vehicle")
    var vehicle: VehicleEntity

    static var parameterSummary: some ParameterSummary {
        Summary("Open front trunk on \(.$vehicle)")
    }

    func perform() async throws -> some IntentResult {
        .result()
    }
}

struct TeslaMockShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: FrontTrunkIntent(),
            phrases: ["Open mock trunk with \(.applicationName)"],
            shortTitle: "Open Mock Trunk",
            systemImageName: "car"
        )
    }
}

@main
struct TeslaMockApp: App {
    init() {
        TeslaMockShortcuts.updateAppShortcutParameters()
    }

    var body: some Scene {
        Text("CarKit Tesla AppIntent test double")
            .padding()
    }
}
