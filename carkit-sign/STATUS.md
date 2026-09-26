# CarKit TW Shortcut Status

Updated: 2026-09-26

Latest Tesla candidate: v1.3 workflow-first (1 vehicle selection; Tesla App remains primary for ordinary vehicle controls).

Branch: `temp/carkit-shortcut-sign`

## Current architecture

- `油車助手`: oil/ICE only. Škoda-first. CarPlay-oriented.
- `特斯拉助手`: Tesla only. Native Tesla AppIntent actions only.
- No Tesla Token, Fleet API, or third-party vehicle-control API.
- Do not merge these two products.

## Verified build gates

The build must pass:

1. plist syntax validation
2. Shortcuts semantic validation
3. CarKit privacy/safety validation
4. shortcut signing
5. AEA1 header verification

## Apple automation facts (iOS 27)

- CarPlay provides Connects and Disconnects triggers.
- Bluetooth Shortcuts automation provides a connect trigger for selected Bluetooth devices.
- There is no documented Bluetooth Disconnect trigger in iOS 27 Shortcuts.
- Personal automations can be permitted to run while locked, but actions that open an app may still require unlocking.
- Apple Maps can place a Parked Car marker after the iPhone disconnects from a vehicle Bluetooth or CarPlay system.

Product consequence:

- The two user-facing main shortcuts do not consume Shortcut Input and contain no AUTO_START/AUTO_END markers.
- CarPlay/Bluetooth automations, if added later, must call separate helper shortcuts so a normal tap never asks for missing input parameters.
- Tesla has no documented Bluetooth Disconnect automation trigger; parked-car navigation uses Apple Maps Parked Car instead.
- Do not treat Phone Key BLE as a proven Shortcuts trigger.

## Tesla public-share vehicle binding

### Removed unsafe approach

Never:
- embed donor VIN
- embed donor vehicle name/image
- assume typed vehicle name resolves a Tesla Vehicle AppEntity
- assume omitting vehicle selects the correct Tesla
- assume one runtime vehicle choice persists across all actions

### Current candidate

Tesla actions whose donors contain a Vehicle AppEntity currently use Apple `Ask` as a runtime vehicle candidate.

Known donor exceptions that omit `vehicle`:
- `ChargeLimitIntent`
- `FlashLightIntent`
- `HVACSeatHeaterIntent`
- `ChargePortIntent` (public open + close donors)
- `HonkIntent`

These donor-backed omissions reduce the current public Tesla setup to 12 vehicle Import Questions.

### Import Question research

`WFWorkflowImportQuestions` can target parameters in third-party AppIntent actions. This provides a plausible native install-time vehicle picker path:

- Category: Parameter
- ParameterKey: vehicle
- ActionIndex: Tesla AppIntent action index

Unresolved:
- whether Tesla's `vehicle` AppEntity picker is presented correctly during import
- whether one chosen vehicle can be reused across multiple AppIntent actions
- single-car behavior
- multi-car consistency

Until verified on iPhone with Tesla app, status is NOT RUN.

## Siri

Both main shortcuts use short names:
- 特斯拉助手
- 油車助手

Current interaction:
- Tapping either shortcut opens a compact native menu immediately.
- Siri can run the shortcut by name and reaches the same menu-first interaction.
- Oil top-level menu is limited to 6 grouped entries.
- Tesla top-level menu is limited to 7 grouped entries.
- Sensitive Tesla actions still require an independent confirmation menu.

Sensitive Tesla commands:
- unlock
- front trunk
- rear trunk

must require independent explicit confirmation.

Horn is now donor-backed via native Tesla `HonkIntent` and is exposed under Find Car.

Real Siri voice-dialog behavior remains NOT RUN without an iPhone Siri runtime.

## Apple Watch

Apple documents that shortcuts using Ask Each Time can be problematic on Apple Watch.

Because Tesla vehicle selection is still an Ask/AppEntity candidate, do not mark CarKit Tesla Watch control as release-ready.

The official Tesla Apple Watch app remains the preferred native Watch vehicle-control surface until CarKit vehicle binding is verified.

## Tesla native AppIntent donor evidence

Current donor-backed identifiers:

- HVACSetTempIntent
- ChargeLimitIntent
- PreconditionIntent
- LockUnlockIntent
- RearTrunkIntent
- FrontTrunkIntent
- DefrostIntent
- VentIntent
- CloseWindowIntent
- SentryModeIntent
- FlashLightIntent
- ChargePortIntent
- HVACSeatHeaterIntent
- HonkIntent
- FartIntent (not exposed in CarKit main UI)

Known parameter evidence:

- LockUnlockIntent: `vehicleControlType = lock | unlock`
- PreconditionIntent: `preconditionAction = start | stop`
- ChargeLimitIntent: `percent` is a numeric string
- HVACSetTempIntent: `temperature` is a `WFQuantityFieldValue`; a 2026 public native donor proves its °C `Magnitude` can reference a named `Temp` variable, allowing one canonical vehicle-backed temperature action for multiple presets
- RearTrunkIntent: public native donors prove `rearTrunkAction = open | close`; CarKit currently exposes one confirmed `open` action to avoid adding another vehicle setup question
- DefrostIntent: public native donors prove `defrostAction = enable | disable`
- ChargePortIntent: public native donors prove `chargePortAction = open | close`; those donors omit `vehicle`
- HonkIntent: public native owner-menu donor proves the action and omits `vehicle`
- HVACSeatHeaterIntent: public native donors prove driver `seat = frontLeft`, `level = high | off`; donors omit `vehicle`
- SentryModeIntent: donor uses Ask for `vehicleModeAction`

Do not guess fixed enum values for donor-Ask fields.

Still missing accepted native donor structures for:
- Start/Stop Charging
- Dog Mode
- Camp Mode
- Bioweapon Defense Mode

Do not invent their AppIntent identifiers.

## Current Tesla RC improvements

Latest program-side Tesla candidate:
- CarKit Shortcut Build Run #75 (commit 8404224a): SUCCESS.
- Native Tesla AppIntent count: 18.
- Vehicle-backed Tesla AppIntent count: 13.
- Vehicle Import Questions: exactly 13 (reduced from 15 by consolidating 22/23/24°C into one donor-proven variable-temperature action).
- Rear trunk: fixed native `RearTrunkIntent + rearTrunkAction=open`, independently confirmed by multiple public native Tesla shortcut donors.
- Charging-station tools: Apple Maps, AmpGO App Store entry, U-POWER, EVALUE, PlugShare.
- Build / semantic / privacy / safety / signing / AEA1: PASS.

Public donor research:
- 2025 native Tesla donors prove rear trunk `open` and `close`, frunk, and charge-port `open`.
- A 2026 Tesla-owner native shortcut proves dynamic `HVACSetTempIntent` temperature variables.
- Public API/token-based Honk / Close Charge Port / Start Charging / Stop Charging shortcuts were probed and rejected because they contained no native `com.teslamotors.TeslaApp.*` actions.
- Public multi-action Tesla shortcuts can contain donor-specific Vehicle AppEntity values. Do not copy those entities into CarKit; retain public install-time vehicle binding.

Hardware boundary:
- 13 repeated vehicle selections are still the safe public-share structure currently supported by evidence.
- One global vehicle choice has still not been proven to propagate safely to every Tesla AppIntent.
- Real Tesla vehicle-control execution remains NOT RUN.

## Physical iPhone v1.2 evidence

User real-device validation on iPhone for signed v1.2:

- Third-party **Open App** actions no longer show the prior `未指定 App` failure for the tested flow: PASS.
- The navigation flow asks for a destination and opens Maps with the entered destination carried into the route flow: PASS.
- These two results specifically validate the v1.2 fixes:
  - `WFSelectedApp { BundleIdentifier, Name }` on generated Open App actions.
  - native `is.workflow.actions.getdirections` navigation with runtime `WFDestination`.
- No private/default home or work destination is embedded.

Scope note:
- This is a real-device PASS for the tested app-opening and navigation flow.
- It does not by itself validate Tesla Vehicle AppEntity selection, real Tesla vehicle controls, Siri voice behavior, Apple Watch runtime, or CarPlay/Bluetooth automation.

## Product release classification

### 油車助手 v1.2
Classification: **public-share candidate**.

Evidence already available:
- signed build / AEA1: PASS
- plist / semantic / privacy / safety gates: PASS
- compact menu-first interaction: PASS
- physical iPhone Open App resolution for the tested flow: PASS
- physical iPhone destination navigation for the tested flow: PASS
- no default private home/work destination embedded: PASS

This classification means the Oil shortcut is the current shareable candidate.
It does not imply every optional third-party app exists on every recipient's iPhone.
If a recipient does not have an optional app installed, that app-specific action may still be unavailable.

### 特斯拉助手 v1.2
Classification: **RC / not public-release complete**.

Still release-blocking:
- real Tesla App Vehicle AppEntity import flow
- single-car / multi-car vehicle selection consistency
- real Tesla vehicle-control execution
- Siri / lock-screen behavior for vehicle controls
- Apple Watch runtime
- real Tesla Bluetooth / vehicle environment

Do not market Tesla v1.2 as fully validated until those physical Tesla-environment checks pass.

## Release acceptance

PASS-able without hardware:
- workflow generation
- plist structure
- semantic validator
- privacy checks
- exact command routing structure
- sensitive-confirmation structure
- signing
- AEA1

Simulator-verified:
- signed 油車助手 opens the iOS Shortcuts share sheet, accepts Add Shortcut, and reaches the shortcut editor
- signed 特斯拉助手 opens the iOS Shortcuts share sheet, accepts Add Shortcut, and reaches the shortcut editor
- this proves file/signing/import compatibility in the iOS Simulator, not real-device Tesla functionality

Must remain NOT RUN without real Apple/Tesla environment:
- physical iPhone import: PARTIAL PASS for the signed v1.2 Oil flow tested on-device; Tesla vehicle-binding import still NOT RUN
- Tesla Vehicle AppEntity picker
- single-car selection
- multi-car selection consistency
- Siri voice interaction
- lock-screen execution behavior
- Tesla real vehicle controls
- Apple Watch CarKit runtime
- CarPlay real vehicle automation
- Tesla Bluetooth real vehicle automation

Do not call the package a final public release while these release-critical items are NOT RUN.

## Additional public Tesla donor findings

- TFF weather/climate donor uses a real Tesla `vehicle` Import Question on a single action:
  - `Category = Parameter`
  - `ParameterKey = vehicle`
  - `ActionIndex = 1`
- The same shortcut contains other Tesla AppIntent actions that do not inherit that selected vehicle automatically.
- This confirms import-time Tesla vehicle selection is structurally possible, but a single Import Question does not prove global vehicle propagation.
- Tesla owner reports also describe multi-car setup as requiring repeated per-action vehicle choices when sharing complex shortcuts.

Public-release consequence:
- Do not claim one vehicle selection configures the whole Tesla shortcut.
- Do not embed donor vehicle entities.
- Multi-car vehicle consistency remains release-blocking until a safe, understandable install flow is proven or real-device tested.


## iOS Simulator import evidence

Latest Tesla donor expansion evidence:
- CarKit Shortcut Build Run #77 (commit eddd573): SUCCESS.
- Native `HonkIntent`: donor-backed and added to Find Car.
- Native `ChargePortIntent(close)`: donor-backed and added to Charging.
- Charge-port open/close donors omit `vehicle`; current vehicle Import Questions reduced from 13 to 12.
- Broad donor inspection confirms public “Start Charging / Stop Charging” candidates use a third-party Auth App for Tesla/token flow, not native Tesla AppIntent; they remain excluded.
- TFF shortcut labelled “Laden beenden” contains `ChargePortIntent(open)` + `FrontTrunkIntent`, not a native Stop Charging action.
- Start/Stop Charging, Dog Mode, Camp Mode, and Bioweapon Defense Mode remain unimplemented until an accepted native donor is obtained.

Latest v1.2 build evidence:
- CarKit Shortcut Build Run #75 (commit 8404224a): SUCCESS.
- Tesla generated structure: 18 native Tesla AppIntent instances, exactly 13 vehicle-backed actions, exactly 13 Vehicle Import Questions: PASS.
- Temperature preset consolidation (22/23/24°C -> one variable HVACSetTempIntent): PASS.
- Rear trunk fixed `open` donor validation: PASS.
- Earlier baseline CarKit Shortcut Build Run #69 (commit b20294e): SUCCESS.
- v1.2 Open App metadata guard: PASS.
- v1.2 native Open Directions destination wiring guard: PASS.
- plist / semantic / privacy / safety validation: PASS.
- shortcut signing and AEA1 header checks: PASS.

Latest candidate evidence:
- CarKit Shortcut Build Run #57 (commit e143f3a): PASS.
- Historical baseline at Run #57: 20 native Tesla AppIntent instances / 15 vehicle-backed / 15 Vehicle Import Questions. Current Run #75 improves this to 18 / 13 / 13.
- plist / semantic / privacy / safety validation: PASS.
- shortcut signing and AEA1 header checks: PASS.
- CarKit iOS Simulator Probe Run #16 (commit c97ab5e): SUCCESS.
- signed Oil shortcut: native Add Shortcut flow -> editor -> independent reopen by name: PASS.
- signed Tesla shortcut: native Add Shortcut flow -> editor -> independent reopen by name: PASS.
- Simulator import PASS proves signed-file/import/editor compatibility only; it does not prove Tesla vehicle runtime.
- Tesla AppIntent runtime: NOT RUN because the stock Simulator cannot establish real Tesla App behavior.
- Tesla Vehicle AppEntity picker: NOT RUN because real Tesla App/AppEntity metadata and account context require a physical Apple/Tesla environment.
- Physical iPhone import, vehicle selection/persistence, single/multi-car consistency, Ask fallback, Siri/lock-screen execution, real Tesla controls, Apple Watch, Škoda CarPlay, and Tesla Bluetooth remain NOT RUN.

Current classification: program-side RC candidate; not a final public release.
