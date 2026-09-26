import plistlib, uuid
from pathlib import Path

OUT=Path("carkit-sign/generated")
OUT.mkdir(parents=True, exist_ok=True)
VERSION="1.0"

def uid(seed):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"CarKitTW/Navigation/v{VERSION}/"+seed)).upper()

def act(identifier, params=None):
    return {"WFWorkflowActionIdentifier":identifier,"WFWorkflowActionParameters":params or {}}

def shortcut_input():
    return {
        "Type":"Variable",
        "Variable":{
            "WFSerializationType":"WFTextTokenAttachment",
            "Value":{"Type":"ExtensionInput"}
        }
    }

inp=shortcut_input()
items=["Apple 地圖","Google Maps","Waze"]
group=uid("nav-menu")
actions=[
    act("is.workflow.actions.choosefrommenu",{
        "UUID":uid("nav-menu-start"),
        "GroupingIdentifier":group,
        "WFControlFlowMode":0,
        "WFMenuPrompt":"CarKit 導航｜選擇導航 App",
        "WFMenuItems":items
    })
]
for i,(title,app) in enumerate(zip(items,["Maps","Google Maps","Waze"])):
    actions.append(act("is.workflow.actions.choosefrommenu",{
        "UUID":uid(f"nav-case-{i}"),
        "GroupingIdentifier":group,
        "WFControlFlowMode":1,
        "WFMenuItemTitle":title
    }))
    params={"UUID":uid(f"directions-{i}"),"WFDestination":inp,"WFGetDirectionsActionApp":app}
    if app in ("Maps","Google Maps"):
        params["WFGetDirectionsActionMode"]="Driving"
    actions.append(act("is.workflow.actions.getdirections",params))
    actions.append(act("is.workflow.actions.exit",{}))
actions.append(act("is.workflow.actions.choosefrommenu",{
    "UUID":uid("nav-menu-end"),
    "GroupingIdentifier":group,
    "WFControlFlowMode":2
}))

wf={
    "WFWorkflowClientVersion":"3400.0",
    "WFWorkflowMinimumClientVersion":900,
    "WFWorkflowMinimumClientVersionString":"900",
    "WFWorkflowTypes":["NCWidget","WatchKit"],
    "WFWorkflowInputContentItemClasses":["WFStringContentItem","WFURLContentItem"],
    "WFWorkflowOutputContentItemClasses":[],
    "WFWorkflowName":"CarKit 導航",
    "WFWorkflowIcon":{"WFWorkflowIconGlyphNumber":59452,"WFWorkflowIconStartColor":4282601983},
    "WFWorkflowActions":actions
}
p=OUT/"CarKit 導航.shortcut.xml"
p.write_bytes(plistlib.dumps(wf,fmt=plistlib.FMT_XML,sort_keys=False))
print(p,len(actions))
