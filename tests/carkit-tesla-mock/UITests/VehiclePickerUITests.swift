import XCTest

@MainActor
final class VehiclePickerUITests: XCTestCase {
    private func element(label: String, in app: XCUIApplication, type: XCUIElement.ElementType = .any) -> XCUIElement {
        app.descendants(matching: type)
            .matching(NSPredicate(format: "label == %@", label))
            .firstMatch
    }

    private func keepScreenshot(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testSelectVehicleA() {
        let shortcuts = XCUIApplication(bundleIdentifier: "com.apple.shortcuts")
        shortcuts.activate()

        let configure = element(label: "Configure This Shortcut", in: shortcuts)
        XCTAssertTrue(configure.waitForExistence(timeout: 8), shortcuts.debugDescription)

        let askButton = element(label: "Ask Each Time", in: shortcuts, type: .button)
        let askAny = element(label: "Ask Each Time", in: shortcuts)
        let ask = askButton.exists ? askButton : askAny
        XCTAssertTrue(ask.waitForExistence(timeout: 5), shortcuts.debugDescription)
        keepScreenshot("01-configure")

        ask.tap()

        let vehicleA = element(label: "測試車 A", in: shortcuts)
        let vehicleB = element(label: "測試車 B", in: shortcuts)
        XCTAssertTrue(vehicleA.waitForExistence(timeout: 10), shortcuts.debugDescription)
        XCTAssertTrue(vehicleB.exists, shortcuts.debugDescription)
        keepScreenshot("02-vehicle-picker")

        vehicleA.tap()

        let selectedA = element(label: "測試車 A", in: shortcuts)
        XCTAssertTrue(selectedA.waitForExistence(timeout: 5), shortcuts.debugDescription)
        keepScreenshot("03-selected-a")

        let addShortcut = element(label: "Add Shortcut", in: shortcuts, type: .button)
        let addFallback = element(label: "Add Shortcut", in: shortcuts)
        let add = addShortcut.exists ? addShortcut : addFallback
        XCTAssertTrue(add.waitForExistence(timeout: 5), shortcuts.debugDescription)
        add.tap()

        sleep(3)
        keepScreenshot("04-after-add")
    }
}
