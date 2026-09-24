import plistlib, uuid
from pathlib import Path

OUT=Path("carkit-sign/generated")
OUT.mkdir(parents=True, exist_ok=True)

TEAM="PS9EBAM2PU"
BUNDLE="com.teslamotors.TeslaApp"

def uid(seed):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "CarKitTW/TeslaDriver/v0.3/"+seed)).upper()

def ao(u,n):
    return {"WFSerializationType":"WFTextTokenAttachment","Value":{"Type":"ActionOutput","OutputUUID":u,"OutputName":n}}

def ask():
    return {"Value":{"Type":"Ask"},"WFSerializationType":"WFTextTokenAttachment"}

def act(i,p=None):
    return {"WFWorkflowActionIdentifier":i,"WFWorkflowActionParameters":p or {}}

def app(bundle,seed):
    return act("is.workflow.actions.openapp",{"UUID":uid(seed),"WFAppIdentifier":bundle})

def url_open(url,seed):
    u=uid(seed+"-url")
    return [
      act("is.workflow.actions.url",{"UUID":u,"WFURLActionURL":url}),
      act("is.workflow.actions.openurl",{"UUID":uid(seed+"-open"),"WFInput":ao(u,"URL")})
    ]

def menu(prompt,items,branches,seed):
    g=uid(seed+"-group")
    comment=act("is.workflow.actions.comment",{
      "UUID":uid(seed+"-comment"),
      "WFCommentActionText":f"{prompt}\n- 顯示這組功能選項\n- 依車主選擇執行對應動作"
    })
    out=[comment,act("is.workflow.actions.choosefrommenu",{
      "UUID":uid(seed+"-start"),"GroupingIdentifier":g,"WFControlFlowMode":0,
      "WFMenuPrompt":prompt,"WFMenuItems":items
    })]
    for x,item in enumerate(items):
      out.append(act("is.workflow.actions.choosefrommenu",{
        "UUID":uid(f"{seed}-case-{x}"),"GroupingIdentifier":g,
        "WFControlFlowMode":1,"WFMenuItemTitle":item
      }))
      out += branches[item]
    out.append(act("is.workflow.actions.choosefrommenu",{
      "UUID":uid(seed+"-end"),"GroupingIdentifier":g,"WFControlFlowMode":2
    }))
    return out

vehicle_uuid=uid("vehicle-name")
vehicle_ref=ao(vehicle_uuid,"Text")

def tesla(intent,seed,extra=None,vehicle=True,show=None):
    p={"UUID":uid(seed),
       "AppIntentDescriptor":{
         "TeamIdentifier":TEAM,"BundleIdentifier":BUNDLE,
         "Name":"Tesla","AppIntentIdentifier":intent
       }}
    if vehicle:
        p["vehicle"]=vehicle_ref
    if extra:
        p.update(extra)
    if show is not None:
        p["ShowWhenRun"]=show
    return act(f"{BUNDLE}.{intent}",p)

def confirm(prompt,action,seed):
    return menu(prompt,["確認","取消"],{
        "確認":[action],
        "取消":[]
    },seed)

# Tesla native action builders verified from public real-world shortcuts.
lock=tesla("LockUnlockIntent","lock",{"vehicleControlType":"lock"})
unlock=tesla("LockUnlockIntent","unlock",{"vehicleControlType":"unlock"})
frunk=tesla("FrontTrunkIntent","frunk")
rear=tesla("RearTrunkIntent","rear",{"rearTrunkAction":ask()})
pre_start=tesla("PreconditionIntent","pre-start",{"preconditionAction":"start"},show=False)
pre_stop=tesla("PreconditionIntent","pre-stop",{"preconditionAction":"stop"},show=False)
defrost=tesla("DefrostIntent","defrost",{"defrostAction":ask()})
vent=tesla("VentIntent","vent")
closewin=tesla("CloseWindowIntent","close-window")
sentry=tesla("SentryModeIntent","sentry",{"vehicleModeAction":ask()})
flash=tesla("FlashLightIntent","flash",vehicle=False)
fart=tesla("FartIntent","fart")

def temp_action(c,seed):
    return tesla("HVACSetTempIntent",seed,{
      "temperature":{
        "Value":{"Unit":"°C","Magnitude":float(c)},
        "WFSerializationType":"WFQuantityFieldValue"
      }
    },show=False)

def charge_limit(pct,seed):
    return tesla("ChargeLimitIntent",seed,{"percent":str(pct)},vehicle=False,show=False)

temp_menu=menu("車室溫度",["22°C","23°C","24°C"],{
    "22°C":[temp_action(22,"temp22")],
    "23°C":[temp_action(23,"temp23")],
    "24°C":[temp_action(24,"temp24")],
},"temp-menu")

climate_menu=menu("空調 / 車室",["開始預冷 / 預熱","停止預冷 / 預熱","設定溫度","除霜"],{
    "開始預冷 / 預熱":[pre_start],
    "停止預冷 / 預熱":[pre_stop],
    "設定溫度":temp_menu,
    "除霜":[defrost],
},"climate-menu")

door_menu=menu("車門控制",["鎖車","解鎖"],{
    "鎖車":[lock],
    "解鎖":confirm("確定要解鎖 Tesla？",unlock,"confirm-unlock"),
},"door-menu")

trunk_menu=menu("行李廂",["前行李廂","後車廂"],{
    "前行李廂":confirm("確定要開啟前行李廂？",frunk,"confirm-frunk"),
    "後車廂":[rear],
},"trunk-menu")

charge_menu=menu("充電中心",["充電上限 80%","充電上限 90%","充電上限 100%","Tesla App 充電","找充電站"],{
    "充電上限 80%":[charge_limit(80,"charge80")],
    "充電上限 90%":[charge_limit(90,"charge90")],
    "充電上限 100%":[charge_limit(100,"charge100")],
    "Tesla App 充電":[app(BUNDLE,"tesla-app-charge")],
    "找充電站":menu("找充電站",["Apple 地圖","AmpGO","PlugShare"],{
        "Apple 地圖":url_open("https://maps.apple.com/?q=%E9%9B%BB%E5%8B%95%E8%BB%8A%E5%85%85%E9%9B%BB%E7%AB%99","charge-maps"),
        "AmpGO":url_open("https://apps.apple.com/tw/app/id6470348628","ampgo-store"),
        "PlugShare":[app("com.xatori.plugshare","plugshare-app")],
    },"charge-stations-menu"),
},"charge-menu")

window_menu=menu("車窗",["通風","關閉車窗"],{
    "通風":[vent],
    "關閉車窗":[closewin],
},"window-menu")

nav_menu=menu("導航",["Apple 地圖","Google Maps","Waze"],{
    "Apple 地圖":[app("com.apple.Maps","nav-apple")],
    "Google Maps":[app("com.google.Maps","nav-google")],
    "Waze":[app("com.waze.iphone","nav-waze")],
},"nav-menu")

more_menu=menu("更多功能",["Tesla App","車窗","除霜","趣味放屁","高速公路1968"],{
    "Tesla App":[app(BUNDLE,"tesla-app")],
    "車窗":window_menu,
    "除霜":[defrost],
    "趣味放屁":[fart],
    "高速公路1968":[app("tw.gov.freeway1968Ver2.Freeway1968HD","tesla-1968")],
},"more-menu")

prepare=[
    pre_start,
    temp_action(23,"prepare-temp23"),
    app("tw.com.ainvest.outpack","prepare-shield"),
    act("is.workflow.actions.notification",{
      "UUID":uid("prepare-notify"),"WFNotificationActionTitle":"Tesla Driver",
      "WFNotificationActionBody":"Tesla 已開始預先調節，神盾已開啟"
    })
]

main_items=[
    "準備出發","空調 / 車室","行李廂","車門控制","充電",
    "神盾","導航","尋車","哨兵模式","更多"
]
main_branches={
    "準備出發":prepare,
    "空調 / 車室":climate_menu,
    "行李廂":trunk_menu,
    "車門控制":door_menu,
    "充電":charge_menu,
    "神盾":[app("tw.com.ainvest.outpack","shield-direct")],
    "導航":nav_menu,
    "尋車":[flash],
    "哨兵模式":[sentry],
    "更多":more_menu,
}

actions=[
  act("is.workflow.actions.comment",{
    "UUID":uid("header-title"),
    "WFCommentActionText":"Tesla Driver v0.3｜Tesla × Apple 智慧車用捷徑\n- 使用 Tesla App 原生 Shortcuts / AppIntent 車控\n- 解鎖與前行李廂等物理操作保留人工確認"
  }),
  act("is.workflow.actions.comment",{
    "UUID":uid("header-validation"),
    "WFCommentActionText":"Shortcuts generated by Shortcuts Playground. May contain mistakes. Always check the shortcut's actions first.\n\nThis shortcut was created via the following user prompt:\n\n> CarKit TW Tesla Driver：Apple 生態優先，整合 Tesla 原生車控、充電、神盾與導航。"
  }),
  act("is.workflow.actions.gettext",{
    "UUID":vehicle_uuid,
    "WFTextActionText":"我的 Tesla"
  })
]
actions += menu("Tesla Driver｜今天要做什麼？",main_items,main_branches,"main-menu")

wf={
 "WFWorkflowClientVersion":"3400.0",
 "WFWorkflowMinimumClientVersion":900,
 "WFWorkflowMinimumClientVersionString":"900",
 "WFWorkflowTypes":["NCWidget","WatchKit"],
 "WFWorkflowInputContentItemClasses":[],
 "WFWorkflowOutputContentItemClasses":[],
 "WFWorkflowIcon":{"WFWorkflowIconGlyphNumber":59511,"WFWorkflowIconStartColor":4274264319},
 "WFWorkflowImportQuestions":[{
    "ActionIndex":2,
    "Category":"Parameter",
    "ParameterKey":"WFTextActionText",
    "Text":"請輸入 Tesla App 中顯示的車輛名稱。所有車控會使用這個名稱，不會儲存 VIN。",
    "DefaultValue":"我的 Tesla"
 }],
 "WFWorkflowActions":actions
}

data=plistlib.dumps(wf,fmt=plistlib.FMT_XML,sort_keys=False)
p=OUT/"Tesla-Driver-v0.3.shortcut.xml"
p.write_bytes(data)
print(p,len(actions),len(data))
