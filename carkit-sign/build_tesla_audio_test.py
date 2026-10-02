import plistlib, uuid
from pathlib import Path

OUT = Path("carkit-sign/generated")
OUT.mkdir(parents=True, exist_ok=True)

VERSION = "1.0-test"
APP_NAMES = {
    "tw.com.ainvest.outpack": "神盾測速照相",
    "com.chaiche.drivesafe": "極行",
}

def uid(seed):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"CarKitTW/TeslaAudioTest/v{VERSION}/" + seed)).upper()

def act(identifier, params=None):
    return {"WFWorkflowActionIdentifier": identifier, "WFWorkflowActionParameters": params or {}}

def app(bundle, seed):
    return act("is.workflow.actions.openapp", {
        "UUID": uid(seed),
        "WFAppIdentifier": bundle,
        "WFSelectedApp": {"BundleIdentifier": bundle, "Name": APP_NAMES[bundle]},
    })

def exit_shortcut():
    return act("is.workflow.actions.exit", {})

def menu(prompt, items, branches, seed):
    gid = uid(seed + "-group")
    out = [
        act("is.workflow.actions.choosefrommenu", {
            "UUID": uid(seed + "-start"),
            "GroupingIdentifier": gid,
            "WFControlFlowMode": 0,
            "WFMenuPrompt": prompt,
            "WFMenuItems": items,
        })
    ]
    for i, item in enumerate(items):
        out.append(act("is.workflow.actions.choosefrommenu", {
            "UUID": uid(f"{seed}-case-{i}"),
            "GroupingIdentifier": gid,
            "WFControlFlowMode": 1,
            "WFMenuItemTitle": item,
        }))
        out += branches[item]
    out.append(act("is.workflow.actions.choosefrommenu", {
        "UUID": uid(seed + "-end"),
        "GroupingIdentifier": gid,
        "WFControlFlowMode": 2,
    }))
    return out

actions = [
    act("is.workflow.actions.comment", {
        "UUID": uid("header"),
        "WFCommentActionText":
            "CarKit TW｜特斯拉上車助手｜車友音訊測試版\n"
            "- 用途：Tesla 藍牙連線後，由 iPhone 個人自動化執行這支捷徑。\n"
            "- 只負責詢問要開神盾、極行或先不用。\n"
            "- 不調整系統音量。\n"
            "- 不切換播放目的地。\n"
            "- 不播放捷徑提示音。\n"
            "- 不暫停或恢復音樂。\n"
            "- 不執行 Tesla 車輛控制。\n"
            "- 實際警示音如何與車內音樂／通話混音，由 iOS 與神盾／極行 App 自身音訊策略決定。"
    }),
]
actions += menu(
    "上車要開哪一個？",
    ["神盾測速照相", "極行", "先不用"],
    {
        "神盾測速照相": [app("tw.com.ainvest.outpack", "open-shield"), exit_shortcut()],
        "極行": [app("com.chaiche.drivesafe", "open-jixing"), exit_shortcut()],
        "先不用": [exit_shortcut()],
    },
    "drive-menu",
)
actions.append(exit_shortcut())

wf = {
    "WFWorkflowClientVersion": "3400.0",
    "WFWorkflowMinimumClientVersion": 900,
    "WFWorkflowMinimumClientVersionString": "900",
    "WFWorkflowTypes": ["NCWidget", "WatchKit"],
    "WFWorkflowOutputContentItemClasses": [],
    "WFWorkflowName": "特斯拉上車助手",
    "WFWorkflowIcon": {
        "WFWorkflowIconGlyphNumber": 61447,
        "WFWorkflowIconStartColor": 4274264319,
    },
    "WFWorkflowActions": actions,
    "WFWorkflowImportQuestions": [],
}

path = OUT / "特斯拉上車助手.wflow"
path.write_bytes(plistlib.dumps(wf, fmt=plistlib.FMT_XML, sort_keys=False))
print(path, "actions", len(actions), "bytes", path.stat().st_size)
