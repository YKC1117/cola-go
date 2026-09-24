import plistlib, uuid
from pathlib import Path

def uid(seed):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "CarKitTW/TeslaVehicleMock/"+seed)).upper()

ask={"Value":{"Type":"Ask"},"WFSerializationType":"WFTextTokenAttachment"}

wf={
    "WFWorkflowClientVersion":"3400.0",
    "WFWorkflowMinimumClientVersion":900,
    "WFWorkflowMinimumClientVersionString":"900",
    "WFWorkflowTypes":["NCWidget"],
    "WFWorkflowInputContentItemClasses":["WFStringContentItem"],
    "WFWorkflowOutputContentItemClasses":[],
    "WFWorkflowIcon":{"WFWorkflowIconGlyphNumber":59511,"WFWorkflowIconStartColor":4274264319},
    "WFWorkflowActions":[
        {
            "WFWorkflowActionIdentifier":"com.teslamotors.TeslaApp.FrontTrunkIntent",
            "WFWorkflowActionParameters":{
                "UUID":uid("front-trunk"),
                "AppIntentDescriptor":{
                    "BundleIdentifier":"com.teslamotors.TeslaApp",
                    "Name":"Tesla",
                    "AppIntentIdentifier":"FrontTrunkIntent"
                },
                "vehicle":ask
            }
        }
    ],
    "WFWorkflowImportQuestions":[
        {
            "Category":"Parameter",
            "ParameterKey":"vehicle",
            "ActionIndex":0,
            "Text":"選擇測試 Tesla"
        }
    ]
}

out=Path("/tmp/carkit-vehicle-mock")
out.mkdir(parents=True,exist_ok=True)
p=out/"Tesla-Vehicle-Import-Test.shortcut.xml"
p.write_bytes(plistlib.dumps(wf,fmt=plistlib.FMT_XML,sort_keys=False))
print(p)
