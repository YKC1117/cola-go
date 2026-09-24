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

struct VehicleQuery: EntityQuery {
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
}

struct FrontTrunkIntent: AppIntent {
    static let title: LocalizedStringResource = "Open Front Trunk"
    static let description = IntentDescription("CarKit test-only mock Tesla intent.")

    @Parameter(title: "Vehicle")
    var vehicle: VehicleEntity

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
        WindowGroup {
            Text("CarKit Tesla AppIntent test double")
                .padding()
        }
    }
}
