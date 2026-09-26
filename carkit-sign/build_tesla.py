import plistlib, uuid
from pathlib import Path

OUT=Path("carkit-sign/generated")
OUT.mkdir(parents=True, exist_ok=True)

VERSION="1.2"
APP_NAMES={
 "tw.com.ainvest.outpack":"神盾測速照相",
 "com.teslamotors.TeslaApp":"Tesla",
 "tw.gov.freeway1968Ver2.Freeway1968HD":"高速公路1968",
 "com.xatori.plugshare":"PlugShare",
 "com.upower":"U-POWER",
 "tw.com.frihed.evalues":"EVALUE",
}

TEAM="PS9EBAM2PU"
BUNDLE="com.teslamotors.TeslaApp"

def uid(seed):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"CarKitTW/TeslaDriver/v{VERSION}/"+seed)).upper()

def ao(u,n):
    return {"WFSerializationType":"WFTextTokenAttachment","Value":{"Type":"ActionOutput","OutputUUID":u,"OutputName":n}}

def named_var(name):
    return {"WFSerializationType":"WFTextTokenAttachment","Value":{"Type":"Variable","VariableName":name}}


def cond_action_output(u,n):
    return {"Type":"Variable","Variable":ao(u,n)}

def cond_named_var(name):
    return {"Type":"Variable","Variable":named_var(name)}

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
    name=APP_NAMES.get(bundle)
    if not name:
        raise ValueError(f"Missing public app metadata for {bundle}")
    return act("is.workflow.actions.openapp",{
        "UUID":uid(seed),
        "WFAppIdentifier":bundle,
        "WFSelectedApp":{
            "BundleIdentifier":bundle,
            "Name":name
        }
    })

def url_open(url,seed):
    u=uid(seed+"-url")
    return [
      act("is.workflow.actions.url",{"UUID":u,"WFURLActionURL":url}),
      act("is.workflow.actions.openurl",{"UUID":uid(seed+"-open"),"WFInput":ao(u,"URL")})
    ]


def navigate_to(maps_app,seed):
    ask,ask_uuid=ask_text("要去哪裡？可輸入地址、店名或地標",seed+"-ask")
    params={
      "UUID":uid(seed+"-directions"),
      "WFDestination":ao(ask_uuid,"Provided Input"),
      "WFGetDirectionsActionApp":maps_app,
    }
    if maps_app in ("Maps","Google Maps"):
        params["WFGetDirectionsActionMode"]="Driving"
    return [
      ask,
      act("is.workflow.actions.getdirections",params),
      exit_shortcut()
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
      })
    ]
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
    # - vehicle-backed intents use Ask as a runtime fallback.
    # - install-time Import Questions target these same vehicle parameters.
    # - donor exceptions that omit vehicle remain omitted.
    if vehicle_mode == "ask":
        p["vehicle"]=ask_token()
    elif vehicle_mode not in (False,None):
        raise ValueError("Unsupported vehicle_mode")
    if extra:
        p.update(extra)
    if show_when_run is not None:
        p["ShowWhenRun"]=show_when_run
    return act(f"{BUNDLE}.{intent}",p)

# ---- donor-backed Tesla actions ----
def lock_action(seed):
    return tesla("LockUnlockIntent",seed,{"vehicleControlType":"lock"})

def unlock_action(seed):
    return tesla("LockUnlockIntent",seed,{"vehicleControlType":"unlock"})

def frunk_action(seed):
    return tesla("FrontTrunkIntent",seed)

def rear_action(seed):
    return tesla("RearTrunkIntent",seed,{"rearTrunkAction":ask_token()})

def pre_start_action(seed):
    return tesla("PreconditionIntent",seed,{"preconditionAction":"start"},show_when_run=False)

def pre_stop_action(seed):
    return tesla("PreconditionIntent",seed,{"preconditionAction":"stop"},show_when_run=False)

def defrost_action(seed):
    return tesla("DefrostIntent",seed,{"defrostAction":"enable"})

def defrost_stop_action(seed):
    return tesla("DefrostIntent",seed,{"defrostAction":"disable"})

def seat_heater_high_action(seed):
    return tesla("HVACSeatHeaterIntent",seed,{
      "seat":"frontLeft",
      "level":"high"
    },vehicle_mode=False,show_when_run=False)

def seat_heater_off_action(seed):
    return tesla("HVACSeatHeaterIntent",seed,{
      "seat":"frontLeft",
      "level":"off"
    },vehicle_mode=False,show_when_run=False)

def open_charge_port_action(seed):
    return tesla("ChargePortIntent",seed,{"chargePortAction":"open"})

def vent_action(seed):
    return tesla("VentIntent",seed)

def close_window_action(seed):
    return tesla("CloseWindowIntent",seed)

def sentry_action(seed):
    return tesla("SentryModeIntent",seed,{"vehicleModeAction":ask_token()})

def flash_action(seed):
    # Public donor omits vehicle for FlashLightIntent.
    return tesla("FlashLightIntent",seed,vehicle_mode=False)

def temp_action(c,seed):
    return tesla("HVACSetTempIntent",seed,{
      "temperature":{
        "Value":{"Unit":"°C","Magnitude":float(c)},
        "WFSerializationType":"WFQuantityFieldValue"
      }
    },show_when_run=False)

def charge_limit_action(pct,seed):
    # Public donor omits vehicle for ChargeLimitIntent.
    return tesla("ChargeLimitIntent",seed,{"percent":str(pct)},vehicle_mode=False,show_when_run=False)

def confirm_then(prompt,action_factory,seed):
    # Touch-first safety confirmation: no exact phrase to memorize.
    return menu(prompt,["確認執行","取消"],{
      "確認執行":[action_factory(seed+"-confirmed"),exit_shortcut()],
      "取消":[show("已取消",seed+"-cancel"),exit_shortcut()]
    },seed+"-confirm-menu")
def route_aliases(input_uuid,aliases,action_factory,seed):
    out=[]
    for i,word in enumerate(aliases):
        out += if_exact(
            cond_action_output(input_uuid,"Provided Input"),
            word,
            [*action_factory(f"{seed}-{i}"),exit_shortcut()],
            f"{seed}-alias-{i}"
        )
    return out

def set_variable(name,value,seed):
    text_uuid=uid(seed+"-text")
    return [
      act("is.workflow.actions.gettext",{
        "UUID":text_uuid,
        "WFTextActionText":value
      }),
      act("is.workflow.actions.setvariable",{
        "UUID":uid(seed+"-set"),
        "WFVariableName":name,
        "WFInput":ao(text_uuid,"Text")
      })
    ]

def set_command(value,seed):
    return set_variable("Command",value,seed)

def set_prepare(seed):
    return [
      *set_command("PRE_START",seed+"-command"),
      *set_variable("PrepareMode","YES",seed+"-flag")
    ]

def normalize_aliases(input_uuid,aliases,command,seed):
    out=[]
    for i,word in enumerate(aliases):
        out += if_exact(
            cond_action_output(input_uuid,"Provided Input"),
            word,
            set_command(command,f"{seed}-set-{i}"),
            f"{seed}-alias-{i}"
        )
    return out

def find_parked_car(seed):
    parked=uid(seed+"-parked")
    maps=uid(seed+"-maps")
    return [
      act("is.workflow.actions.getparkedcarlocation",{"UUID":parked}),
      act("is.workflow.actions.getmapslink",{"UUID":maps,"WFInput":ao(parked,"Parked Car Location")}),
      act("is.workflow.actions.openurl",{"UUID":uid(seed+"-open"),"WFInput":ao(maps,"Maps URL")})
    ]

# ---- touch menus: Tesla controls set one canonical command instead of duplicating AppIntents ----
temp_menu=menu("車室溫度",["22°C","23°C","24°C"],{
    "22°C":set_command("TEMP_22","menu-temp22"),
    "23°C":set_command("TEMP_23","menu-temp23"),
    "24°C":set_command("TEMP_24","menu-temp24"),
},"temp-menu")

climate_menu=menu("空調 / 車室",[
    "開始預冷 / 預熱","停止預冷 / 預熱","設定溫度",
    "除霜","停止除霜","駕駛座加熱","關閉座椅加熱"
],{
    "開始預冷 / 預熱":set_command("PRE_START","menu-pre-start"),
    "停止預冷 / 預熱":set_command("PRE_STOP","menu-pre-stop"),
    "設定溫度":temp_menu,
    "除霜":set_command("DEFROST_ON","menu-defrost"),
    "停止除霜":set_command("DEFROST_OFF","menu-defrost-stop"),
    "駕駛座加熱":set_command("SEAT_HIGH","menu-seat-high"),
    "關閉座椅加熱":set_command("SEAT_OFF","menu-seat-off"),
},"climate-menu")

door_menu=menu("車門控制",["鎖車","解鎖"],{
    "鎖車":set_command("LOCK","menu-lock"),
    "解鎖":set_command("UNLOCK","menu-unlock"),
},"door-menu")

trunk_menu=menu("行李廂",["前行李廂","後車廂"],{
    "前行李廂":set_command("FRUNK","menu-frunk"),
    "後車廂":set_command("REAR","menu-rear"),
},"trunk-menu")

charge_station_menu=menu("找充電站",["Apple 地圖","AmpGO（App Store）","U-POWER","EVALUE","PlugShare"],{
    "Apple 地圖":[*url_open("https://maps.apple.com/?q=%E9%9B%BB%E5%8B%95%E8%BB%8A%E5%85%85%E9%9B%BB%E7%AB%99","menu-charge-maps"),exit_shortcut()],
    "AmpGO（App Store）":[*url_open("https://apps.apple.com/tw/app/id6470348628","menu-ampgo-store"),exit_shortcut()],
    "U-POWER":[app("com.upower","menu-upower"),exit_shortcut()],
    "EVALUE":[app("tw.com.frihed.evalues","menu-evalue"),exit_shortcut()],
    "PlugShare":[app("com.xatori.plugshare","menu-plugshare"),exit_shortcut()],
},"charge-stations-menu")

charge_menu=menu("充電中心",[
    "開啟充電孔","充電上限 80%","充電上限 90%","Tesla App 充電","找充電站"
],{
    "開啟充電孔":set_command("CHARGE_PORT_OPEN","menu-charge-port-open"),
    "充電上限 80%":set_command("CHARGE_80","menu-charge80"),
    "充電上限 90%":set_command("CHARGE_90","menu-charge90"),
    "Tesla App 充電":[app(BUNDLE,"menu-tesla-app-charge"),exit_shortcut()],
    "找充電站":charge_station_menu,
},"charge-menu")

window_menu=menu("車窗",["通風","關閉車窗"],{
    "通風":set_command("VENT","menu-vent"),
    "關閉車窗":set_command("WINDOW_CLOSE","menu-close-window"),
},"window-menu")

vehicle_menu=menu("車輛控制",[
    "鎖車","解鎖","前行李廂","後車廂","車窗通風","關閉車窗"
],{
    "鎖車":set_command("LOCK","menu-vehicle-lock"),
    "解鎖":set_command("UNLOCK","menu-vehicle-unlock"),
    "前行李廂":set_command("FRUNK","menu-vehicle-frunk"),
    "後車廂":set_command("REAR","menu-vehicle-rear"),
    "車窗通風":set_command("VENT","menu-vehicle-vent"),
    "關閉車窗":set_command("WINDOW_CLOSE","menu-vehicle-close-window"),
},"vehicle-menu")

find_menu=menu("找車",["Apple 地圖找車","閃燈尋車"],{
    "Apple 地圖找車":[*find_parked_car("menu-find-parked-car"),exit_shortcut()],
    "閃燈尋車":set_command("FLASH","menu-flash-find"),
},"find-menu")

nav_menu=menu("導航",["Apple 地圖","Google Maps","Waze"],{
    "Apple 地圖":navigate_to("Maps","menu-nav-apple"),
    "Google Maps":navigate_to("Google Maps","menu-nav-google"),
    "Waze":navigate_to("Waze","menu-nav-waze"),
},"nav-menu")

more_menu=menu("更多功能",["神盾","Tesla App","高速公路1968","哨兵模式"],{
    "神盾":[app("tw.com.ainvest.outpack","menu-shield"),exit_shortcut()],
    "Tesla App":[app(BUNDLE,"menu-tesla-app"),exit_shortcut()],
    "高速公路1968":[app("tw.gov.freeway1968Ver2.Freeway1968HD","menu-1968"),exit_shortcut()],
    "哨兵模式":set_command("SENTRY","menu-sentry"),
},"more-menu")

main_items=[
    "準備出發","空調","車輛控制","充電","找車","導航","更多"
]
main_branches={
    "準備出發":set_prepare("menu-prepare"),
    "空調":climate_menu,
    "車輛控制":vehicle_menu,
    "充電":charge_menu,
    "找車":find_menu,
    "導航":nav_menu,
    "更多":more_menu,
}
manual_menu=menu("特斯拉助手｜請選功能",main_items,main_branches,"main-menu")

# ---- safe automation ----
auto_start=[
    app("tw.com.ainvest.outpack","auto-start-shield"),
    exit_shortcut()
]

actions=[
  act("is.workflow.actions.comment",{
    "UUID":uid("header-title"),
    "WFCommentActionText":"Tesla Driver v1.2｜特斯拉助手\n- Tesla / Oil Driver 維持兩個獨立捷徑\n- 點開捷徑直接顯示 7 個主要功能，不需要背口令\n- 導航使用 Apple 原生 Open Directions，直接帶入每次輸入的目的地；不保存預設地址\n- Siri 呼叫「特斯拉助手」時使用同一套選單\n- 解鎖、前行李廂、後車廂改用按鈕再次確認\n- 公開版不包含 donor VIN、車名、圖片或私人檔案引用\n- vehicle-backed Tesla AppIntent 仍使用原生安裝綁定；未設定時保留 Ask Each Time 安全 fallback\n- Tesla 藍牙自動化只使用 Connect；不偽造 Bluetooth Disconnect\n- 找我的車使用 Apple Maps 系統停車位置；閃燈尋車才呼叫 Tesla FlashLightIntent\n- ALLOW_MANUAL_UNIT_CONVERSION：Tesla HVAC 直接使用攝氏溫度數值，未進行任何單位換算"
  }),
  act("is.workflow.actions.comment",{
    "UUID":uid("header-validation"),
    "WFCommentActionText":"Shortcuts generated by Shortcuts Playground. May contain mistakes. Always check the shortcut's actions first.\n\nThis shortcut was created via the following user prompt:\n\n> CarKit TW Tesla Driver：Tesla 原生 AppIntent、Siri 短口令、安全確認、多車安裝綁定與台灣車用工具。"
  }),
  act("is.workflow.actions.comment",{
    "UUID":uid("vehicle-status"),
    "WFCommentActionText":"Tesla 選車策略：\n- 不使用手填車名、VIN 或 donor 車輛資料。\n- 每個需要 vehicle 的唯一 Tesla AppIntent 建立 Parameter Import Question。\n- 使用者安裝時應對所有問題選同一台 Tesla；多車帳號不假設自動繼承。\n- 若 Import Question 未完成，action 仍是 Ask Each Time，不會自動猜車。"
  })
]

# User-facing shortcut: no Shortcut Input dependency. Automations must use separate helper shortcuts.

# Always initialize canonical command to empty text.
actions += set_command("NONE","command-init")
actions += set_variable("PrepareMode","NO","prepare-init")

# Main interactive entry: one tap / Siri invocation goes straight to the menu.
actions += manual_menu

# ---- one canonical Tesla AppIntent per actual function ----
cmd=cond_named_var("Command")
pre_start_flow=[
    pre_start_action("canonical-pre-start"),
    *if_exact(
        cond_named_var("PrepareMode"),
        "YES",
        [app("tw.com.ainvest.outpack","canonical-pre-start-shield")],
        "canonical-pre-start-prepare"
    ),
    exit_shortcut()
]
actions += if_exact(cmd,"PRE_START",pre_start_flow,"run-pre-start")
actions += if_exact(cmd,"PRE_STOP",[pre_stop_action("canonical-pre-stop"),exit_shortcut()],"run-pre-stop")
actions += if_exact(cmd,"TEMP_22",[temp_action(22,"canonical-temp22"),exit_shortcut()],"run-temp22")
actions += if_exact(cmd,"TEMP_23",[temp_action(23,"canonical-temp23"),exit_shortcut()],"run-temp23")
actions += if_exact(cmd,"TEMP_24",[temp_action(24,"canonical-temp24"),exit_shortcut()],"run-temp24")
actions += if_exact(cmd,"LOCK",[lock_action("canonical-lock"),exit_shortcut()],"run-lock")
actions += if_exact(cmd,"UNLOCK",confirm_then("確定要解鎖 Tesla？",unlock_action,"canonical-unlock"),"run-unlock")
actions += if_exact(cmd,"FRUNK",confirm_then("確定要開啟前行李廂？",frunk_action,"canonical-frunk"),"run-frunk")
actions += if_exact(cmd,"REAR",confirm_then("確定要操作後車廂？",rear_action,"canonical-rear"),"run-rear")
actions += if_exact(cmd,"CHARGE_80",[charge_limit_action(80,"canonical-charge80"),exit_shortcut()],"run-charge80")
actions += if_exact(cmd,"CHARGE_90",[charge_limit_action(90,"canonical-charge90"),exit_shortcut()],"run-charge90")
actions += if_exact(cmd,"CHARGE_PORT_OPEN",[open_charge_port_action("canonical-charge-port"),exit_shortcut()],"run-charge-port")
actions += if_exact(cmd,"FLASH",[flash_action("canonical-flash"),exit_shortcut()],"run-flash")
actions += if_exact(cmd,"DEFROST_ON",[defrost_action("canonical-defrost-on"),exit_shortcut()],"run-defrost-on")
actions += if_exact(cmd,"DEFROST_OFF",[defrost_stop_action("canonical-defrost-off"),exit_shortcut()],"run-defrost-off")
actions += if_exact(cmd,"SEAT_HIGH",[seat_heater_high_action("canonical-seat-high"),exit_shortcut()],"run-seat-high")
actions += if_exact(cmd,"SEAT_OFF",[seat_heater_off_action("canonical-seat-off"),exit_shortcut()],"run-seat-off")
actions += if_exact(cmd,"VENT",[vent_action("canonical-vent"),exit_shortcut()],"run-vent")
actions += if_exact(cmd,"WINDOW_CLOSE",[close_window_action("canonical-window-close"),exit_shortcut()],"run-window-close")
actions += if_exact(cmd,"SENTRY",[sentry_action("canonical-sentry"),exit_shortcut()],"run-sentry")

actions.append(exit_shortcut())

# ---- native install-time vehicle binding ----
# A public Tesla donor proves that WFWorkflowImportQuestions can target an
# AppIntent vehicle parameter using Category=Parameter, ParameterKey=vehicle,
# and ActionIndex. DefaultValue is deliberately omitted so no donor vehicle
# entity can leak into the public file. The underlying action stays Ask Each
# Time if the import question is skipped or unsupported.
intent_labels={
  "PreconditionIntent":"空調預先調節",
  "HVACSetTempIntent":"車室溫度",
  "LockUnlockIntent":"車門鎖",
  "FrontTrunkIntent":"前行李廂",
  "RearTrunkIntent":"後車廂",
  "ChargePortIntent":"充電孔",
  "DefrostIntent":"除霜",
  "VentIntent":"車窗通風",
  "CloseWindowIntent":"關閉車窗",
  "SentryModeIntent":"哨兵模式",
}
vehicle_indexes=[]
for i,a in enumerate(actions):
    ident=a.get("WFWorkflowActionIdentifier","")
    p=a.get("WFWorkflowActionParameters",{})
    if ident.startswith(BUNDLE+".") and "vehicle" in p:
        vehicle_indexes.append((i,ident.split(".")[-1]))

import_questions=[]
total=len(vehicle_indexes)
for number,(index,intent) in enumerate(vehicle_indexes,1):
    label=intent_labels.get(intent,intent)
    import_questions.append({
      "Category":"Parameter",
      "ParameterKey":"vehicle",
      "ActionIndex":index,
      "Text":f"Tesla 設定 {number}/{total}｜請都選同一台車：{label}"
    })

wf={
 "WFWorkflowClientVersion":"3400.0",
 "WFWorkflowMinimumClientVersion":900,
 "WFWorkflowMinimumClientVersionString":"900",
 "WFWorkflowTypes":["NCWidget","WatchKit"],
 "WFWorkflowOutputContentItemClasses":[],
 "WFWorkflowName":"特斯拉助手",
 "WFWorkflowIcon":{"WFWorkflowIconGlyphNumber":61447,"WFWorkflowIconStartColor":4274264319},
 "WFWorkflowActions":actions,
 "WFWorkflowImportQuestions":import_questions,
}

data=plistlib.dumps(wf,fmt=plistlib.FMT_XML,sort_keys=False)
p=OUT/"特斯拉助手.shortcut.xml"
p.write_bytes(data)
print(p,"actions",len(actions),"vehicle_import_questions",len(import_questions),"bytes",len(data))
