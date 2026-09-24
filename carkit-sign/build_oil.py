import plistlib, uuid
from pathlib import Path

OUT=Path("carkit-sign/generated")
OUT.mkdir(parents=True, exist_ok=True)
VERSION="0.5"

def uid(seed):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"CarKitTW/OilDriver/v{VERSION}/"+seed)).upper()

def ao(u,n):
    return {"WFSerializationType":"WFTextTokenAttachment","Value":{"Type":"ActionOutput","OutputUUID":u,"OutputName":n}}

def cond_action_output(u,n):
    return {"Type":"Variable","Variable":ao(u,n)}

def cond_extension_input():
    return {
      "Type":"Variable",
      "Variable":{
        "Value":{"Type":"ExtensionInput"},
        "WFSerializationType":"WFTextTokenAttachment"
      }
    }

def act(i,p=None):
    return {"WFWorkflowActionIdentifier":i,"WFWorkflowActionParameters":p or {}}

def exit_shortcut():
    return act("is.workflow.actions.exit",{})

def show(text,seed):
    return act("is.workflow.actions.showresult",{"UUID":uid(seed),"Text":text})

def ask_text(prompt,seed):
    u=uid(seed)
    return act("is.workflow.actions.ask",{
        "UUID":u,
        "WFAskActionPrompt":prompt,
        "WFInputType":"Text"
    }),u

def if_exact(input_ref,value,yes_actions,seed):
    g=uid(seed+"-group")
    return [
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
        "UUID":uid(seed+"-end"),
        "GroupingIdentifier":g,
        "WFControlFlowMode":2
      })
    ]

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
    out=[act("is.workflow.actions.choosefrommenu",{
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

def route_aliases(input_uuid,aliases,action_factory,seed):
    out=[]
    for i,word in enumerate(aliases):
        actions=action_factory(f"{seed}-{i}")
        out += if_exact(
            cond_action_output(input_uuid,"Provided Input"),
            word,
            [*actions,exit_shortcut()],
            f"{seed}-alias-{i}"
        )
    return out

# ----- Existing oil-car core -----
nav=menu("選擇導航 App",["Apple 地圖","Google Maps","Waze"],{
 "Apple 地圖":[app("com.apple.Maps","menu-nav-apple")],
 "Google Maps":[app("com.google.Maps","menu-nav-google")],
 "Waze":[app("com.waze.iphone","menu-nav-waze")]
},"nav-menu")

traffic=menu("即時路況",["高速公路1968","Waze"],{
 "高速公路1968":[app("tw.gov.freeway1968Ver2.Freeway1968HD","menu-traffic-1968")],
 "Waze":[app("com.waze.iphone","menu-traffic-waze")]
},"traffic-menu")

parking=menu("停車工具",["附近停車場（Apple 地圖）","停車大聲公","uTagGo"],{
 "附近停車場（Apple 地圖）":url_open("https://maps.apple.com/?q=%E5%81%9C%E8%BB%8A%E5%A0%B4","menu-parking-maps"),
 "停車大聲公":[app("com.alfred.parkinglot","menu-parking-app")],
 "uTagGo":[app("fetci.eTagGO.PRD","menu-parking-utaggo")]
},"parking-menu")

fuel=menu("加油工具",["附近加油站（Apple 地圖）","uTagGo 油價"],{
 "附近加油站（Apple 地圖）":url_open("https://maps.apple.com/?q=%E5%8A%A0%E6%B2%B9%E7%AB%99","menu-fuel-maps"),
 "uTagGo 油價":[app("fetci.eTagGO.PRD","menu-fuel-utaggo")]
},"fuel-menu")

music=menu("音樂",["Apple Music","Spotify"],{
 "Apple Music":[app("com.apple.Music","menu-music-apple")],
 "Spotify":[app("com.spotify.client","menu-music-spotify")]
},"music-menu")

def save_parking(seed):
    cur=uid(seed+"-location")
    return [
      act("is.workflow.actions.getcurrentlocation",{"UUID":cur}),
      act("is.workflow.actions.setparkedcar",{
        "UUID":uid(seed+"-set"),
        "WFLocation":ao(cur,"Current Location"),
        "WFSetParkedCarNotes":"Oil Driver 記錄"
      }),
      act("is.workflow.actions.notification",{
        "UUID":uid(seed+"-notify"),
        "WFNotificationActionTitle":"Oil Driver",
        "WFNotificationActionBody":"已記錄停車位置"
      })
    ]

def find_car(seed):
    gp=uid(seed+"-getparked")
    gl=uid(seed+"-maplink")
    return [
      act("is.workflow.actions.getparkedcarlocation",{"UUID":gp}),
      act("is.workflow.actions.getmapslink",{"UUID":gl,"WFInput":ao(gp,"Parked Car Location")}),
      act("is.workflow.actions.openurl",{"UUID":uid(seed+"-open"),"WFInput":ao(gl,"Maps URL")})
    ]

items=["開始開車","導航","神盾","即時路況","找停車場","找加油站","eTag / 通行費","記錄停車位置","找我的車","音樂"]
branches={
 "開始開車":[app("tw.com.ainvest.outpack","menu-start-shield")],
 "導航":nav,
 "神盾":[app("tw.com.ainvest.outpack","menu-shield")],
 "即時路況":traffic,
 "找停車場":parking,
 "找加油站":fuel,
 "eTag / 通行費":[app("fetci.eTagGO.PRD","menu-etag")],
 "記錄停車位置":save_parking("menu-save-parking"),
 "找我的車":find_car("menu-find-car"),
 "音樂":music,
}
manual_menu=menu("Oil Driver｜要做什麼？",items,branches,"main-menu")

actions=[
  act("is.workflow.actions.comment",{
    "UUID":uid("header-title"),
    "WFCommentActionText":"Oil Driver v0.5｜油車助手\n- 與 Tesla Driver 完全分開\n- Siri：嘿 Siri，油車助手 → 只問「要做什麼？」\n- 語音採精確比對；未知或否定句不執行\n- 主線保留 CarPlay、神盾、導航、路況、停車、加油、eTag、找車與音樂"
  })
]

# CarPlay / automation entry. AUTO_START/AUTO_END remain non-sensitive.
actions += if_exact(
    cond_extension_input(),"AUTO_START",
    [app("tw.com.ainvest.outpack","auto-start-shield"),exit_shortcut()],
    "route-auto-start"
)
actions += if_exact(
    cond_extension_input(),"AUTO_END",
    [*save_parking("auto-end-parking"),exit_shortcut()],
    "route-auto-end"
)

voice,voice_id=ask_text("要做什麼？","voice-command")
actions.append(voice)

# Fast Siri commands.
actions += route_aliases(voice_id,["導航","Apple導航","蘋果導航"],
    lambda s:[app("com.apple.Maps",s)],"voice-nav-apple")
actions += route_aliases(voice_id,["Google導航","Google Maps"],
    lambda s:[app("com.google.Maps",s)],"voice-nav-google")
actions += route_aliases(voice_id,["Waze"],
    lambda s:[app("com.waze.iphone",s)],"voice-nav-waze")
actions += route_aliases(voice_id,["神盾"],
    lambda s:[app("tw.com.ainvest.outpack",s)],"voice-shield")
actions += route_aliases(voice_id,["路況","1968","高速公路"],
    lambda s:[app("tw.gov.freeway1968Ver2.Freeway1968HD",s)],"voice-traffic")
actions += route_aliases(voice_id,["停車","停車場"],
    lambda s:url_open("https://maps.apple.com/?q=%E5%81%9C%E8%BB%8A%E5%A0%B4",s),"voice-parking")
actions += route_aliases(voice_id,["停車大聲公"],
    lambda s:[app("com.alfred.parkinglot",s)],"voice-parking-app")
actions += route_aliases(voice_id,["加油","加油站"],
    lambda s:url_open("https://maps.apple.com/?q=%E5%8A%A0%E6%B2%B9%E7%AB%99",s),"voice-fuel")
actions += route_aliases(voice_id,["eTag","ETag","etag","通行費"],
    lambda s:[app("fetci.eTagGO.PRD",s)],"voice-etag")
actions += route_aliases(voice_id,["記停車","記錄停車","停車位置"],
    save_parking,"voice-save-parking")
actions += route_aliases(voice_id,["找車","找我的車"],
    find_car,"voice-find-car")
actions += route_aliases(voice_id,["音樂","Apple Music"],
    lambda s:[app("com.apple.Music",s)],"voice-music")
actions += route_aliases(voice_id,["Spotify"],
    lambda s:[app("com.spotify.client",s)],"voice-spotify")
actions += route_aliases(voice_id,["選單","功能"],
    lambda s:manual_menu,"voice-menu")

actions += [
  show("沒聽懂，未執行任何操作。","voice-unknown"),
  exit_shortcut()
]

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
p=OUT/"油車助手.shortcut.xml"
p.write_bytes(data)
print(p,len(actions),len(data))
