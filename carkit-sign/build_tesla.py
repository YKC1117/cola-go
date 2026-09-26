import plistlib, uuid
from pathlib import Path

OUT=Path("carkit-sign/generated")
OUT.mkdir(parents=True, exist_ok=True)

VERSION="1.3"
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
    # Public 2025 Tesla donor proves rearTrunkAction="open".
    # Keep one canonical action so install-time vehicle questions do not increase.
    return tesla("RearTrunkIntent",seed,{"rearTrunkAction":"open"},show_when_run=False)

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
    # Public native Tesla donors prove ChargePortIntent(open) omits vehicle.
    return tesla("ChargePortIntent",seed,{"chargePortAction":"open"},vehicle_mode=False)

def close_charge_port_action(seed):
    # Public owner-menu donor proves chargePortAction="close" and omits vehicle.
    return tesla("ChargePortIntent",seed,{"chargePortAction":"close"},vehicle_mode=False)

def honk_action(seed):
    # Public owner-menu donor proves HonkIntent and omits vehicle.
    return tesla("HonkIntent",seed,vehicle_mode=False)

def vent_action(seed):
    return tesla("VentIntent",seed)

def close_window_action(seed):
    return tesla("CloseWindowIntent",seed)

def sentry_action(seed):
    return tesla("SentryModeIntent",seed,{"vehicleModeAction":ask_token()})

def flash_action(seed):
    # Public donor omits vehicle for FlashLightIntent.
    return tesla("FlashLightIntent",seed,vehicle_mode=False)

def temp_action(seed):
    # A 2026 public native Tesla donor proves HVACSetTempIntent accepts a
    # named variable as the quantity Magnitude. This lets CarKit keep one
    # vehicle-backed temperature action instead of one action per preset.
    return tesla("HVACSetTempIntent",seed,{
      "temperature":{
        "Value":{
          "Unit":"°C",
          "Magnitude":{"VariableName":"Temp","Type":"Variable"}
        },
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

def set_number_variable(name,value,seed):
    number_uuid=uid(seed+"-number")
    return [
      act("is.workflow.actions.number",{
        "UUID":number_uuid,
        "WFNumberActionNumber":str(value)
      }),
      act("is.workflow.actions.setvariable",{
        "UUID":uid(seed+"-set"),
        "WFVariableName":name,
        "WFInput":ao(number_uuid,"Number")
      })
    ]

def set_command(value,seed):
    return set_variable("Command",value,seed)

def set_temp_command(value,seed):
    return [
      *set_number_variable("Temp",value,seed+"-value"),
      *set_command("TEMP",seed+"-command")
    ]

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

# ---- touch menus: CarKit complements Tesla instead of duplicating the Tesla App ----
charge_station_menu=menu("找充電站",["Apple 地圖","AmpGO（App Store）","U-POWER","EVALUE","PlugShare"],{
    "Apple 地圖":[*url_open("https://maps.apple.com/?q=%E9%9B%BB%E5%8B%95%E8%BB%8A%E5%85%85%E9%9B%BB%E7%AB%99","menu-charge-maps"),exit_shortcut()],
    "AmpGO（App Store）":[*url_open("https://apps.apple.com/tw/app/id6470348628","menu-ampgo-store"),exit_shortcut()],
    "U-POWER":[app("com.upower","menu-upower"),exit_shortcut()],
    "EVALUE":[app("tw.com.frihed.evalues","menu-evalue"),exit_shortcut()],
    "PlugShare":[app("com.xatori.plugshare","menu-plugshare"),exit_shortcut()],
},"charge-stations-menu")

find_menu=menu("停車 / 找車",["Apple 地圖找車","Tesla 閃燈","Tesla 鳴喇叭"],{
    "Apple 地圖找車":[*find_parked_car("menu-find-parked-car"),exit_shortcut()],
    "Tesla 閃燈":set_command("FLASH","menu-flash-find"),
    "Tesla 鳴喇叭":set_command("HONK","menu-honk-find"),
},"find-menu")

nav_menu=menu("導航",["Apple 地圖","Google Maps","Waze"],{
    "Apple 地圖":navigate_to("Maps","menu-nav-apple"),
    "Google Maps":navigate_to("Google Maps","menu-nav-google"),
    "Waze":navigate_to("Waze","menu-nav-waze"),
},"nav-menu")

quick_nav_menu=menu("快速出發｜選擇導航",["Apple 地圖","Google Maps","Waze"],{
    "Apple 地圖":navigate_to("Maps","quick-nav-apple"),
    "Google Maps":navigate_to("Google Maps","quick-nav-google"),
    "Waze":navigate_to("Waze","quick-nav-waze"),
},"quick-nav-menu")

driving_tools_menu=menu("行車工具",["神盾測速照相","高速公路1968","Tesla App"],{
    "神盾測速照相":[app("tw.com.ainvest.outpack","menu-shield"),exit_shortcut()],
    "高速公路1968":[app("tw.gov.freeway1968Ver2.Freeway1968HD","menu-1968"),exit_shortcut()],
    "Tesla App":[app(BUNDLE,"menu-tesla-app-tools"),exit_shortcut()],
},"driving-tools-menu")

main_items=[
    "快速出發","導航","找充電站","停車 / 找車","行車工具","Tesla App"
]
main_branches={
    "快速出發":set_command("QUICK_START","menu-quick-start"),
    "導航":nav_menu,
    "找充電站":charge_station_menu,
    "停車 / 找車":find_menu,
    "行車工具":driving_tools_menu,
    "Tesla App":[app(BUNDLE,"menu-tesla-app"),exit_shortcut()],
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
    "WFCommentActionText":"CarKit TW｜特斯拉助手 v1.3\n- 使用 iPhone 內建「捷徑」整理給 Tesla 車友免費使用\n- Tesla 原廠負責一般車輛控制，這支捷徑主要整理出發、導航、找充電站、停車找車與台灣行車工具\n- 快速出發：先替車輛做出發前預先調節，再選擇 Apple 地圖、Google Maps 或 Waze 導航\n- 導航目的地每次自己輸入，不會預設住家或公司\n- 找車可使用 Apple 地圖停車位置、Tesla 閃燈與鳴喇叭\n- 第一次加入時只需要選一次自己的 Tesla"
  }),
  act("is.workflow.actions.comment",{
    "UUID":uid("header-validation"),
    "WFCommentActionText":"Shortcuts generated by Shortcuts Playground. May contain mistakes. Always check the shortcut's actions first.\n\nThis shortcut was created via the following user prompt:\n\n> CarKit TW｜Tesla 車友免費捷徑：快速出發、導航、找充電站、停車找車與台灣行車工具。"
  }),
  act("is.workflow.actions.comment",{
    "UUID":uid("vehicle-status"),
    "WFCommentActionText":"第一次設定\n只有「快速出發」需要指定 Tesla。加入捷徑時選擇你要使用的車輛即可；如果帳號內有多台 Tesla，請選擇這支捷徑要搭配的那一台。"
  })
]

# User-facing shortcut: no Shortcut Input dependency. Automations must use separate helper shortcuts.

# Always initialize canonical command to empty text.
actions += set_command("NONE","command-init")

# Main interactive entry: one tap / Siri invocation goes straight to the menu.
actions += manual_menu

# ---- minimal Tesla AppIntent surface: only workflow value that Tesla App alone does not provide ----
cmd=cond_named_var("Command")
quick_start_flow=[
    pre_start_action("canonical-quick-start-precondition"),
    *quick_nav_menu,
    exit_shortcut()
]
actions += if_exact(cmd,"QUICK_START",quick_start_flow,"run-quick-start")
actions += if_exact(cmd,"FLASH",[flash_action("canonical-flash"),exit_shortcut()],"run-flash")
actions += if_exact(cmd,"HONK",[honk_action("canonical-honk"),exit_shortcut()],"run-honk")

actions.append(exit_shortcut())

# ---- native install-time vehicle binding ----
# A public Tesla donor proves that WFWorkflowImportQuestions can target an
# AppIntent vehicle parameter using Category=Parameter, ParameterKey=vehicle,
# and ActionIndex. DefaultValue is deliberately omitted so no donor vehicle
# entity can leak into the public file. The underlying action stays Ask Each
# Time if the import question is skipped or unsupported.
intent_labels={
  "PreconditionIntent":"出發前預先調節",
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
    question_text=(
      f"第一次設定｜請選擇你的 Tesla：{label}"
      if total==1
      else f"Tesla 設定 {number}/{total}｜請都選同一台車：{label}"
    )
    import_questions.append({
      "Category":"Parameter",
      "ParameterKey":"vehicle",
      "ActionIndex":index,
      "Text":question_text
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
