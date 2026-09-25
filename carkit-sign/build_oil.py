import plistlib, uuid
from pathlib import Path

OUT=Path("carkit-sign/generated")
OUT.mkdir(parents=True, exist_ok=True)
VERSION="1.0"

def uid(seed):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"CarKitTW/OilDriver/v{VERSION}/"+seed)).upper()

def ao(u,n):
    return {"WFSerializationType":"WFTextTokenAttachment","Value":{"Type":"ActionOutput","OutputUUID":u,"OutputName":n}}

def cond_action_output(u,n):
    return {"Type":"Variable","Variable":ao(u,n)}

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
      act("is.workflow.actions.comment",{
        "UUID":uid(seed+"-comment"),
        "WFCommentActionText":f"精確比對「{value}」\n- 輸入：上一個文字結果\n- 符合：執行此分支\n- 否則：繼續後續路由"
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
    out=[
      act("is.workflow.actions.comment",{
        "UUID":uid(seed+"-comment"),
        "WFCommentActionText":f"{prompt}\n- 顯示：此功能選單\n- 輸入：使用者選擇\n- 輸出：執行對應動作"
      }),
      act("is.workflow.actions.choosefrommenu",{
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

parking_center=menu("停車 / 找車",[
 "附近停車場","記錄停車位置","找我的車","停車大聲公","uTagGo"
],{
 "附近停車場":url_open("https://maps.apple.com/?q=%E5%81%9C%E8%BB%8A%E5%A0%B4","menu-parking-nearby"),
 "記錄停車位置":save_parking("menu-save-parking"),
 "找我的車":find_car("menu-find-car"),
 "停車大聲公":[app("com.alfred.parkinglot","menu-parking-app")],
 "uTagGo":[app("fetci.eTagGO.PRD","menu-parking-utaggo")]
},"parking-center")

fuel_center=menu("加油 / eTag",[
 "附近加油站","uTagGo 油價","eTag / 通行費"
],{
 "附近加油站":url_open("https://maps.apple.com/?q=%E5%8A%A0%E6%B2%B9%E7%AB%99","menu-fuel-nearby"),
 "uTagGo 油價":[app("fetci.eTagGO.PRD","menu-fuel-utaggo")],
 "eTag / 通行費":[app("fetci.eTagGO.PRD","menu-etag")]
},"fuel-center")

items=["開始開車","導航","路況","停車 / 找車","加油 / eTag","音樂"]
branches={
 "開始開車":[app("tw.com.ainvest.outpack","menu-start-shield")],
 "導航":nav,
 "路況":traffic,
 "停車 / 找車":parking_center,
 "加油 / eTag":fuel_center,
 "音樂":music,
}
manual_menu=menu("油車助手｜請選功能",items,branches,"main-menu")

actions=[
  act("is.workflow.actions.comment",{
    "UUID":uid("header-title"),
    "WFCommentActionText":"Oil Driver v1.0｜油車助手\n- 與 Tesla Driver 完全分開\n- 點開捷徑直接顯示功能選單，不需要輸入文字或背口令\n- Siri 呼叫「油車助手」時使用同一套選單\n- 主線保留 CarPlay、神盾、導航、路況、停車、加油、eTag、找車與音樂"
  }),
  act("is.workflow.actions.comment",{
    "UUID":uid("header-validation"),
    "WFCommentActionText":"Shortcuts generated by Shortcuts Playground. May contain mistakes. Always check the shortcut's actions first.\n\nThis shortcut was created via the following user prompt:\n\n> CarKit TW Oil Driver：Apple 生態優先的台灣油車 Siri / CarPlay 日常駕駛捷徑。"
  }),
]

# User-facing shortcut: no Shortcut Input dependency. Automations must use separate helper shortcuts.
# Main interactive entry: one tap / Siri invocation goes straight to the menu.
actions += manual_menu
actions.append(exit_shortcut())

wf={
 "WFWorkflowClientVersion":"3400.0",
 "WFWorkflowMinimumClientVersion":900,
 "WFWorkflowMinimumClientVersionString":"900",
 "WFWorkflowTypes":["NCWidget","WatchKit"],
 "WFWorkflowOutputContentItemClasses":[],
 "WFWorkflowIcon":{"WFWorkflowIconGlyphNumber":59511,"WFWorkflowIconStartColor":4282601983},
 "WFWorkflowActions":actions
}

data=plistlib.dumps(wf,fmt=plistlib.FMT_XML,sort_keys=False)
p=OUT/"油車助手.shortcut.xml"
p.write_bytes(data)
print(p,len(actions),len(data))
