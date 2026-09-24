# CarKit TW Shortcut Status

Updated: 2026-09-24

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

- Oil / Škoda:
  - CarPlay Connect -> AUTO_START candidate.
  - CarPlay Disconnect -> AUTO_END candidate.
- Tesla:
  - Tesla audio/phone Bluetooth Connect -> AUTO_START candidate.
  - NO Bluetooth AUTO_END.
  - Parked-car navigation uses Apple Maps Parked Car instead.
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

Known donor exceptions:
- `ChargeLimitIntent`: donor has no `vehicle` parameter.
- `FlashLightIntent`: donor has no `vehicle` parameter.

These exceptions must remain unchanged until a newer native donor proves otherwise.

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
- Siri runs shortcut by name.
- shortcut asks: `要做什麼？`
- exact-match routing is used.
- contains matching is forbidden.
- unknown, blank, negative, or ambiguous input must not fall into sensitive vehicle control.

Sensitive Tesla commands:
- unlock
- front trunk
- rear trunk
- horn (when native donor is eventually added)

must require independent explicit confirmation.

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
- FartIntent (not exposed in CarKit main UI)

Known parameter evidence:

- LockUnlockIntent: `vehicleControlType = lock | unlock`
- PreconditionIntent: `preconditionAction = start | stop`
- ChargeLimitIntent: `percent` is a numeric string
- HVACSetTempIntent: `temperature` is a `WFQuantityFieldValue`
- RearTrunkIntent: donor uses Ask for `rearTrunkAction`
- DefrostIntent: public native donors prove `defrostAction = enable | disable`
- ChargePortIntent: public native donor proves `chargePortAction = open`
- HVACSeatHeaterIntent: public native donors prove driver `seat = frontLeft`, `level = high | off`; donors omit `vehicle`
- SentryModeIntent: donor uses Ask for `vehicleModeAction`

Do not guess fixed enum values for donor-Ask fields.

Still missing native donor structures for:
- Honk Horn
- Close Charge Port
- Start/Stop Charging
- Dog Mode
- Camp Mode
- Bioweapon Defense Mode

Do not invent their AppIntent identifiers.

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
- physical iPhone import
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

GitHub Actions Run #7 (CarKit iOS Simulator Probe):
- signed Oil shortcut: Add Shortcut page visible -> Add Shortcut -> editor visible: PASS
- signed Tesla shortcut: Add Shortcut page visible -> Add Shortcut -> editor visible: PASS
- Shortcuts app accepted both AEA1 files: PASS
- Tesla AppIntent execution: NOT RUN because the stock Simulator does not contain Tesla.app
- Tesla logs explicitly report com.teslamotors.TeslaApp missing from linkd / LaunchServices, which is treated as an environment limitation rather than a shortcut-format failure
- Tesla vehicle import picker: NOT RUN because Tesla AppEntity metadata is unavailable without the Tesla app
