import plistlib, uuid
from pathlib import Path

OUT=Path("carkit-sign/generated")
OUT.mkdir(parents=True, exist_ok=True)

def uid(seed):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "CarKitTW/OilDriver/v0.3/"+seed)).upper()

def ao(u,n):
    return {"WFSerializationType":"WFTextTokenAttachment","Value":{"Type":"ActionOutput","OutputUUID":u,"OutputName":n}}

def act(i,p=None):
    return {"WFWorkflowActionIdentifier":i,"WFWorkflowActionParameters":p or {}}

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
    a=[act("is.workflow.actions.choosefrommenu",{
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
actions=menu("Oil Driver｜今天要做什麼？",items,branches,"main-menu")

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
p=OUT/"Oil-Driver-v0.3.shortcut.xml"
p.write_bytes(data)
print(p, len(actions), len(data))

# trigger Tesla donor inspection
