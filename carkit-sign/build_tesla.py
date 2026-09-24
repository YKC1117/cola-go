import plistlib, uuid
from pathlib import Path

OUT=Path("carkit-sign/generated")
OUT.mkdir(parents=True, exist_ok=True)

VERSION="0.5"
TEAM="PS9EBAM2PU"
BUNDLE="com.teslamotors.TeslaApp"

def uid(seed):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"CarKitTW/TeslaDriver/v{VERSION}/"+seed)).upper()

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

def ask_token():
    return {"Value":{"Type":"Ask"},"WFSerializationType":"WFTextTokenAttachment"}

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
        "WFCommentActionText":f"精確比對「{value}」；符合才執行此分支，否則繼續。"
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
        "WFCommentActionText":f"{prompt}：顯示功能選單，依使用者選擇執行對應動作。"
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

def tesla(intent,seed,extra=None,vehicle_mode="ask",show_when_run=None):
    p={
      "UUID":uid(seed),
      "AppIntentDescriptor":{
        "TeamIdentifier":TEAM,
        "BundleIdentifier":BUNDLE,
        "Name":"Tesla",
        "AppIntentIdentifier":intent
      }
    }
    # Public-share safety:
    # - never embed donor VIN/name/image.
    # - for intents whose public donors contain a Vehicle AppEntity, use Apple's
    #   Ask token as the runtime candidate until iPhone/Tesla runtime verification.
    # - intents observed in public donors without a vehicle parameter keep it omitted.
    if vehicle_mode == "ask":
        p["vehicle"]=ask_token()
    elif vehicle_mode not in (False,None):
        raise ValueError("Unsupported vehicle_mode")
    if extra:
        p.update(extra)
    if show_when_run is not None:
        p["ShowWhenRun"]=show_when_run
    return act(f"{BUNDLE}.{intent}",p)

# Tesla native actions for which public donor evidence exists.
def lock_action(seed):
    return tesla("LockUnlockIntent",seed,{"vehicleControlType":"lock"})

def unlock_action(seed):
    return tesla("LockUnlockIntent",seed,{"vehicleControlType":"unlock"})

def frunk_action(seed):
    return tesla("FrontTrunkIntent",seed)

def rear_action(seed):
    # rearTrunkAction fixed enum values are not guessed; donor uses Ask.
    return tesla("RearTrunkIntent",seed,{"rearTrunkAction":ask_token()})

def pre_start_action(seed):
    return tesla("PreconditionIntent",seed,{"preconditionAction":"start"},show_when_run=False)

def pre_stop_action(seed):
    return tesla("PreconditionIntent",seed,{"preconditionAction":"stop"},show_when_run=False)

def defrost_action(seed):
    # defrostAction fixed enum values are not guessed; donor uses Ask.
    return tesla("DefrostIntent",seed,{"defrostAction":ask_token()})

def vent_action(seed):
    return tesla("VentIntent",seed)

def close_window_action(seed):
    return tesla("CloseWindowIntent",seed)

def sentry_action(seed):
    # vehicleModeAction fixed enum values are not guessed; donor uses Ask.
    return tesla("SentryModeIntent",seed,{"vehicleModeAction":ask_token()})

def flash_action(seed):
    # Public donor omits vehicle for FlashLightIntent. Do not invent one.
    return tesla("FlashLightIntent",seed,vehicle_mode=False)

def temp_action(c,seed):
    return tesla("HVACSetTempIntent",seed,{
      "temperature":{
        "Value":{"Unit":"°C","Magnitude":float(c)},
        "WFSerializationType":"WFQuantityFieldValue"
      }
    },show_when_run=False)

def charge_limit_action(pct,seed):
    # Public donors omit vehicle for ChargeLimitIntent. Multi-car targeting is NOT RUN.
    return tesla("ChargeLimitIntent",seed,{"percent":str(pct)},vehicle_mode=False,show_when_run=False)

def confirm_then(prompt,action_factory,seed):
    q,qid=ask_text(prompt+" 請說「確認」。",seed+"-ask")
    out=[q]
    # Only explicit affirmative words execute. Cancellation, blank, negation and
    # unknown text fall through to immediate cancellation.
    for i,word in enumerate(["確認","確定","是"]):
        out += if_exact(
            cond_action_output(qid,"Provided Input"),
            word,
            [action_factory(f"{seed}-yes-{i}"), exit_shortcut()],
            f"{seed}-confirm-{i}"
        )
    out += [show("已取消",seed+"-cancel"),exit_shortcut()]
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

def one(action):
    return [action]

# ----- Touch menu -----
temp_menu=menu("車室溫度",["22°C","23°C","24°C"],{
    "22°C":[temp_action(22,"menu-temp22")],
    "23°C":[temp_action(23,"menu-temp23")],
    "24°C":[temp_action(24,"menu-temp24")],
},"temp-menu")

climate_menu=menu("空調 / 車室",["開始預冷 / 預熱","停止預冷 / 預熱","設定溫度","除霜"],{
    "開始預冷 / 預熱":[pre_start_action("menu-pre-start")],
    "停止預冷 / 預熱":[pre_stop_action("menu-pre-stop")],
    "設定溫度":temp_menu,
    "除霜":[defrost_action("menu-defrost")],
},"climate-menu")

door_menu=menu("車門控制",["鎖車","解鎖"],{
    "鎖車":[lock_action("menu-lock")],
    "解鎖":confirm_then("確定要解鎖 Tesla？",unlock_action,"menu-unlock"),
},"door-menu")

trunk_menu=menu("行李廂",["前行李廂","後車廂"],{
    "前行李廂":confirm_then("確定要開啟前行李廂？",frunk_action,"menu-frunk"),
    "後車廂":confirm_then("確定要操作後車廂？",rear_action,"menu-rear"),
},"trunk-menu")

charge_menu=menu("充電中心",["充電上限 80%","充電上限 90%","Tesla App 充電","找充電站"],{
    "充電上限 80%":[charge_limit_action(80,"menu-charge80")],
    "充電上限 90%":[charge_limit_action(90,"menu-charge90")],
    "Tesla App 充電":[app(BUNDLE,"menu-tesla-app-charge")],
    "找充電站":menu("找充電站",["Apple 地圖","AmpGO","PlugShare"],{
        "Apple 地圖":url_open("https://maps.apple.com/?q=%E9%9B%BB%E5%8B%95%E8%BB%8A%E5%85%85%E9%9B%BB%E7%AB%99","menu-charge-maps"),
        "AmpGO":url_open("https://apps.apple.com/tw/app/id6470348628","menu-ampgo-store"),
        "PlugShare":[app("com.xatori.plugshare","menu-plugshare")],
    },"charge-stations-menu"),
},"charge-menu")

window_menu=menu("車窗",["通風","關閉車窗"],{
    "通風":[vent_action("menu-vent")],
    "關閉車窗":[close_window_action("menu-close-window")],
},"window-menu")

nav_menu=menu("導航",["Apple 地圖","Google Maps","Waze"],{
    "Apple 地圖":[app("com.apple.Maps","menu-nav-apple")],
    "Google Maps":[app("com.google.Maps","menu-nav-google")],
    "Waze":[app("com.waze.iphone","menu-nav-waze")],
},"nav-menu")

more_menu=menu("更多功能",["Tesla App","車窗","除霜","高速公路1968"],{
    "Tesla App":[app(BUNDLE,"menu-tesla-app")],
    "車窗":window_menu,
    "除霜":[defrost_action("menu-more-defrost")],
    "高速公路1968":[app("tw.gov.freeway1968Ver2.Freeway1968HD","menu-1968")],
},"more-menu")

prepare_menu_actions=[
    pre_start_action("menu-prepare-precondition"),
    app("tw.com.ainvest.outpack","menu-prepare-shield")
]

main_items=[
    "準備出發","空調 / 車室","行李廂","車門控制","充電",
    "神盾","導航","閃燈尋車","哨兵模式","更多"
]
main_branches={
    "準備出發":prepare_menu_actions,
    "空調 / 車室":climate_menu,
    "行李廂":trunk_menu,
    "車門控制":door_menu,
    "充電":charge_menu,
    "神盾":[app("tw.com.ainvest.outpack","menu-shield")],
    "導航":nav_menu,
    "閃燈尋車":[flash_action("menu-flash-find")],
    "哨兵模式":[sentry_action("menu-sentry")],
    "更多":more_menu,
}
manual_menu=menu("Tesla Driver｜要做什麼？",main_items,main_branches,"main-menu")

# ----- Safe automation routes -----
auto_start=[
    app("tw.com.ainvest.outpack","auto-start-shield"),
    exit_shortcut()
]
auto_cur=uid("auto-end-current-location")
auto_end=[
    act("is.workflow.actions.getcurrentlocation",{"UUID":auto_cur}),
    act("is.workflow.actions.setparkedcar",{
        "UUID":uid("auto-end-set-parked-car"),
        "WFLocation":ao(auto_cur,"Current Location"),
        "WFSetParkedCarNotes":"Tesla Driver 自動記錄"
    }),
    exit_shortcut()
]

actions=[
  act("is.workflow.actions.comment",{
    "UUID":uid("header-title"),
    "WFCommentActionText":"Tesla Driver v0.5｜特斯拉助手\n- Tesla / Oil Driver 維持兩個獨立捷徑\n- Siri：嘿 Siri，特斯拉助手 → 只問「要做什麼？」\n- 語音採精確比對，不用 contains，避免「不要解鎖」誤觸\n- 解鎖、前行李廂、後車廂需再次明確確認\n- 公開版不包含 donor VIN、車名、圖片或私人檔案引用"
  }),
  act("is.workflow.actions.comment",{
    "UUID":uid("header-validation"),
    "WFCommentActionText":"Shortcuts generated by Shortcuts Playground. May contain mistakes. Always check the shortcut's actions first.\n\nThis shortcut was created via the following user prompt:\n\n> CarKit TW Tesla Driver：Tesla 原生 AppIntent、Siri 短口令、安全確認與台灣車用工具。"
  }),
  act("is.workflow.actions.comment",{
    "UUID":uid("vehicle-status"),
    "WFCommentActionText":"Tesla 選車狀態：\n- 已移除『手填車名當 vehicle』方案。\n- 有 Vehicle AppEntity 的 donor Intent 改用 Apple Ask token 作 runtime 選車候選。\n- ChargeLimitIntent / FlashLightIntent 依 donor 證據維持無 vehicle。\n- 單車 / 多車實際選車一致性需要 iPhone + Tesla App / 車輛環境驗證，現在標示 NOT RUN。"
  })
]

# AUTO_START / AUTO_END exact routing. Sensitive Tesla actions are not reachable here.
actions += if_exact(cond_extension_input(),"AUTO_START",auto_start,"route-auto-start")
actions += if_exact(cond_extension_input(),"AUTO_END",auto_end,"route-auto-end")

# ----- Siri / text command entry -----
voice,voice_id=ask_text("要做什麼？","voice-command")
actions.append(voice)

# Simple, exact aliases.
actions += route_aliases(voice_id,["預冷","冷氣","開冷氣"],
    lambda s: one(pre_start_action(s)),"voice-precondition")
actions += route_aliases(voice_id,["停止預冷","關冷氣"],
    lambda s: one(pre_stop_action(s)),"voice-precondition-stop")
actions += route_aliases(voice_id,["23度","23 度","二十三度"],
    lambda s: one(temp_action(23,s)),"voice-temp23")
actions += route_aliases(voice_id,["前車廂","前行李廂"],
    lambda s: confirm_then("確定要開啟前行李廂？",frunk_action,s),"voice-frunk")
actions += route_aliases(voice_id,["後車廂","後行李廂"],
    lambda s: confirm_then("確定要操作後車廂？",rear_action,s),"voice-rear")
actions += route_aliases(voice_id,["鎖車"],
    lambda s: one(lock_action(s)),"voice-lock")
actions += route_aliases(voice_id,["解鎖","開鎖"],
    lambda s: confirm_then("確定要解鎖 Tesla？",unlock_action,s),"voice-unlock")
actions += route_aliases(voice_id,["充到80","充到 80","充到80%","充到 80%"],
    lambda s: one(charge_limit_action(80,s)),"voice-charge80")
actions += route_aliases(voice_id,["充到90","充到 90","充到90%","充到 90%"],
    lambda s: one(charge_limit_action(90,s)),"voice-charge90")
actions += route_aliases(voice_id,["閃燈","找車","閃燈尋車"],
    lambda s: one(flash_action(s)),"voice-flash")
actions += route_aliases(voice_id,["除霧","除霜"],
    lambda s: one(defrost_action(s)),"voice-defrost")
actions += route_aliases(voice_id,["神盾"],
    lambda s: [app("tw.com.ainvest.outpack",s)],"voice-shield")
actions += route_aliases(voice_id,["導航","Apple導航","蘋果導航"],
    lambda s: [app("com.apple.Maps",s)],"voice-nav-apple")
actions += route_aliases(voice_id,["Google導航","Google Maps"],
    lambda s: [app("com.google.Maps",s)],"voice-nav-google")
actions += route_aliases(voice_id,["Waze"],
    lambda s: [app("com.waze.iphone",s)],"voice-nav-waze")
actions += route_aliases(voice_id,["哨兵","哨兵模式"],
    lambda s: one(sentry_action(s)),"voice-sentry")
actions += route_aliases(voice_id,["準備出發","出發"],
    lambda s: [pre_start_action(s+"-pre"),app("tw.com.ainvest.outpack",s+"-shield")],"voice-prepare")
actions += route_aliases(voice_id,["選單"],
    lambda s: manual_menu,"voice-menu")

# Ambiguous "充電" gets one short follow-up; exact answers only.
def charging_followup(seed):
    q,qid=ask_text("充到 80、90，還是開 Tesla？",seed+"-ask")
    out=[q]
    out += route_aliases(qid,["80","80%","八十"],
        lambda s: one(charge_limit_action(80,s)),seed+"-80")
    out += route_aliases(qid,["90","90%","九十"],
        lambda s: one(charge_limit_action(90,s)),seed+"-90")
    out += route_aliases(qid,["Tesla","開 Tesla","App"],
        lambda s: [app(BUNDLE,s)],seed+"-app")
    out += [show("未執行充電操作",seed+"-unknown"),exit_shortcut()]
    return out

actions += route_aliases(voice_id,["充電"],charging_followup,"voice-charging")

# Unknown / negated phrases do nothing.
actions += [
    show("沒聽懂，未執行任何車控。","voice-unknown"),
    exit_shortcut()
]

wf={
 "WFWorkflowClientVersion":"3400.0",
 "WFWorkflowMinimumClientVersion":900,
 "WFWorkflowMinimumClientVersionString":"900",
 "WFWorkflowTypes":["NCWidget","WatchKit"],
 "WFWorkflowInputContentItemClasses":["WFStringContentItem"],
 "WFWorkflowOutputContentItemClasses":[],
 "WFWorkflowIcon":{"WFWorkflowIconGlyphNumber":59511,"WFWorkflowIconStartColor":4274264319},
 "WFWorkflowActions":actions
}

data=plistlib.dumps(wf,fmt=plistlib.FMT_XML,sort_keys=False)
p=OUT/"特斯拉助手.shortcut.xml"
p.write_bytes(data)
print(p,len(actions),len(data))
