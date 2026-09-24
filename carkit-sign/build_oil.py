import plistlib, uuid
from pathlib import Path

OUT=Path("carkit-sign/generated")
OUT.mkdir(parents=True, exist_ok=True)

def uid(seed):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "CarKitTW/OilDriver/v0.4/"+seed)).upper()

def ao(u,n):
    return {"WFSerializationType":"WFTextTokenAttachment","Value":{"Type":"ActionOutput","OutputUUID":u,"OutputName":n}}

def act(i,p=None):
    return {"WFWorkflowActionIdentifier":i,"WFWorkflowActionParameters":p or {}}

def shortcut_input_condition(value,yes_actions,no_actions,seed,label):
    g=uid(seed+"-group")
    input_ref={
      "Type":"Variable",
      "Variable":{
        "Value":{"Type":"ExtensionInput"},
        "WFSerializationType":"WFTextTokenAttachment"
      }
    }
    return [
      act("is.workflow.actions.comment",{
        "UUID":uid(seed+"-comment"),
        "WFCommentActionText":f"{label}\n- 讀取傳入捷徑的文字模式\n- 符合時直接執行車機自動流程，不顯示主選單"
      }),
      act("is.workflow.actions.conditional",{
        "UUID":uid(seed+"-start"),
        "GroupingIdentifier":g,
        "WFControlFlowMode":0,
        "WFCondition":4,
        "WFConditionalActionString":value,
        "WFInput":input_ref
      }),
      *yes_actions,
      act("is.workflow.actions.conditional",{
        "UUID":uid(seed+"-else"),
        "GroupingIdentifier":g,
        "WFControlFlowMode":1
      }),
      *no_actions,
      act("is.workflow.actions.conditional",{
        "UUID":uid(seed+"-end"),
        "GroupingIdentifier":g,
        "WFControlFlowMode":2
      })
    ]

def app(bundle,seed):
    return act("is.workflow.actions.openapp",{"UUID":uid(seed),"WFAppIdentifier":bundle})

def url_open(url,seed):
    u=uid(seed+"-url"); o=uid(seed+"-open")
    return [
      act("is.workflow.actions.url",{"UUID":u,"WFURLActionURL":url}),
      act("is.workflow.actions.openurl",{"UUID":o,"WFInput":ao(u,"URL")})
    ]

def menu(prompt,items,branches,seed):
    g=uid(seed+"-group")
    comment=act("is.workflow.actions.comment",{
      "UUID":uid(seed+"-comment"),
      "WFCommentActionText":f"{prompt}\n- 顯示這組功能選項\n- 依車主選擇執行對應動作"
    })
    a=[comment,act("is.workflow.actions.choosefrommenu",{
      "UUID":uid(seed+"-start"),"GroupingIdentifier":g,"WFControlFlowMode":0,
      "WFMenuPrompt":prompt,"WFMenuItems":items
    })]
    for x,item in enumerate(items):
      a.append(act("is.workflow.actions.choosefrommenu",{
        "UUID":uid(f"{seed}-case-{x}"),"GroupingIdentifier":g,
        "WFControlFlowMode":1,"WFMenuItemTitle":item
      }))
      a += branches[item]
    a.append(act("is.workflow.actions.choosefrommenu",{
      "UUID":uid(seed+"-end"),"GroupingIdentifier":g,"WFControlFlowMode":2
    }))
    return a

nav=menu("選擇導航 App",["Apple 地圖","Google Maps","Waze"],{
 "Apple 地圖":[app("com.apple.Maps","nav-apple")],
 "Google Maps":[app("com.google.Maps","nav-google")],
 "Waze":[app("com.waze.iphone","nav-waze")]
},"nav-menu")

traffic=menu("即時路況",["高速公路1968","Waze"],{
 "高速公路1968":[app("tw.gov.freeway1968Ver2.Freeway1968HD","traffic-1968")],
 "Waze":[app("com.waze.iphone","traffic-waze")]
},"traffic-menu")

parking=menu("停車工具",["附近停車場（Apple 地圖）","停車大聲公","uTagGo"],{
 "附近停車場（Apple 地圖）":url_open("https://maps.apple.com/?q=%E5%81%9C%E8%BB%8A%E5%A0%B4","parking-maps"),
 "停車大聲公":[app("com.alfred.parkinglot","parking-app")],
 "uTagGo":[app("fetci.eTagGO.PRD","parking-utaggo")]
},"parking-menu")

fuel=menu("加油工具",["附近加油站（Apple 地圖）","uTagGo 油價"],{
 "附近加油站（Apple 地圖）":url_open("https://maps.apple.com/?q=%E5%8A%A0%E6%B2%B9%E7%AB%99","fuel-maps"),
 "uTagGo 油價":[app("fetci.eTagGO.PRD","fuel-utaggo")]
},"fuel-menu")

music=menu("音樂",["Apple Music","Spotify"],{
 "Apple Music":[app("com.apple.Music","music-apple")],
 "Spotify":[app("com.spotify.client","music-spotify")]
},"music-menu")

cur=uid("park-current-location")
save=[
 act("is.workflow.actions.getcurrentlocation",{"UUID":cur}),
 act("is.workflow.actions.setparkedcar",{
   "UUID":uid("park-set"),"WFLocation":ao(cur,"Current Location"),
   "WFSetParkedCarNotes":"Oil Driver 記錄"
 }),
 act("is.workflow.actions.notification",{
   "UUID":uid("park-notify"),"WFNotificationActionTitle":"Oil Driver",
   "WFNotificationActionBody":"已記錄停車位置"
 })
]

gp=uid("find-getparked"); gl=uid("find-maplink")
find=[
 act("is.workflow.actions.getparkedcarlocation",{"UUID":gp}),
 act("is.workflow.actions.getmapslink",{"UUID":gl,"WFInput":ao(gp,"Parked Car Location")}),
 act("is.workflow.actions.openurl",{"UUID":uid("find-openlink"),"WFInput":ao(gl,"Maps URL")})
]

start=[
 app("tw.com.ainvest.outpack","start-shield"),
 act("is.workflow.actions.notification",{
   "UUID":uid("start-notify"),"WFNotificationActionTitle":"Oil Driver",
   "WFNotificationActionBody":"神盾已開啟，準備行車"
 })
]

items=["開始開車","導航","神盾","即時路況","找停車場","找加油站","eTag / 通行費","記錄停車位置","找我的車","音樂"]
branches={
 "開始開車":start,
 "導航":nav,
 "神盾":[app("tw.com.ainvest.outpack","shield-direct")],
 "即時路況":traffic,
 "找停車場":parking,
 "找加油站":fuel,
 "eTag / 通行費":[app("fetci.eTagGO.PRD","etag-utaggo")],
 "記錄停車位置":save,
 "找我的車":find,
 "音樂":music,
}
manual_menu=menu("Oil Driver｜今天要做什麼？",items,branches,"main-menu")

auto_start=[
  app("tw.com.ainvest.outpack","auto-start-shield")
]

auto_cur=uid("auto-end-current-location")
auto_end=[
  act("is.workflow.actions.getcurrentlocation",{"UUID":auto_cur}),
  act("is.workflow.actions.setparkedcar",{
    "UUID":uid("auto-end-set-parked-car"),
    "WFLocation":ao(auto_cur,"Current Location"),
    "WFSetParkedCarNotes":"Oil Driver 自動記錄"
  })
]

auto_end_route=shortcut_input_condition(
  "AUTO_END",auto_end,manual_menu,
  "route-auto-end","辨識下車自動化"
)

actions=[
  act("is.workflow.actions.comment",{
    "UUID":uid("header-title"),
    "WFCommentActionText":"Oil Driver v0.4｜台灣油車日常駕駛捷徑\n- 主打 CarPlay、導航、神盾、停車、加油與找車\n- 不包含電動車與低頻保養功能"
  }),
  act("is.workflow.actions.comment",{
    "UUID":uid("header-validation"),
    "WFCommentActionText":"Shortcuts generated by Shortcuts Playground. May contain mistakes. Always check the shortcut's actions first.\n\nThis shortcut was created via the following user prompt:\n\n> CarKit TW Oil Driver：Apple 生態優先的台灣油車日常駕駛捷徑。"
  })
] + shortcut_input_condition(
  "AUTO_START",auto_start,auto_end_route,
  "route-auto-start","辨識上車自動化"
)

wf={
 "WFWorkflowClientVersion":"3400.0",
 "WFWorkflowMinimumClientVersion":900,
 "WFWorkflowMinimumClientVersionString":"900",
 "WFWorkflowTypes":["NCWidget","WatchKit"],
 "WFWorkflowInputContentItemClasses":["WFStringContentItem"],
 "WFWorkflowOutputContentItemClasses":[],
 "WFWorkflowIcon":{"WFWorkflowIconGlyphNumber":59511,"WFWorkflowIconStartColor":4282601983},
 "WFWorkflowActions":actions
}
data=plistlib.dumps(wf,fmt=plistlib.FMT_XML,sort_keys=False)
p=OUT/"Oil-Driver-v0.4.shortcut.xml"
p.write_bytes(data)
print(p, len(actions), len(data))
