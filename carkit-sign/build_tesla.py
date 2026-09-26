import plistlib, uuid
from pathlib import Path

OUT=Path("carkit-sign/generated")
OUT.mkdir(parents=True, exist_ok=True)

VERSION="1.5"
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

def normalize_temp_aliases(input_uuid,aliases,value,seed):
    out=[]
    for i,word in enumerate(aliases):
        out += if_exact(
            cond_action_output(input_uuid,"Provided Input"),
            word,
            set_temp_command(value,f"{seed}-set-{i}"),
            f"{seed}-alias-{i}"
        )
    return out

def voice_command_flow(seed):
    ask,ask_uuid=ask_text("要控制 Tesla 什麼功能？",seed+"-ask")
    out=[
      *set_variable("VoiceMode","YES",seed+"-voice-mode"),
      ask,
    ]
    specs=[
      (["預冷","預熱","開始預冷","開始預熱","開冷氣"],"PRE_START","pre-start"),
      (["停止預冷","停止預熱","關冷氣"],"PRE_STOP","pre-stop"),
      (["除霜","開除霜"],"DEFROST_ON","defrost-on"),
      (["停止除霜","關除霜"],"DEFROST_OFF","defrost-off"),
      (["座椅加熱","駕駛座加熱"],"SEAT_HIGH","seat-high"),
      (["關閉座椅加熱","關座椅加熱"],"SEAT_OFF","seat-off"),
      (["鎖車","上鎖"],"LOCK","lock"),
      (["解鎖"],"UNLOCK","unlock"),
      (["前行李廂","開前行李廂"],"FRUNK","frunk"),
      (["後車廂","開後車廂","後行李廂"],"REAR","rear"),
      (["車窗通風","通風"],"VENT","vent"),
      (["關閉車窗","關窗"],"WINDOW_CLOSE","window-close"),
      (["開充電孔","打開充電孔"],"CHARGE_PORT_OPEN","charge-open"),
      (["關充電孔","關閉充電孔"],"CHARGE_PORT_CLOSE","charge-close"),
      (["充電80","充電 80","充電80%","充電上限80"],"CHARGE_80","charge80"),
      (["充電90","充電 90","充電90%","充電上限90"],"CHARGE_90","charge90"),
      (["哨兵","哨兵模式"],"SENTRY","sentry"),
      (["閃燈"],"FLASH","flash"),
      (["鳴喇叭","喇叭","按喇叭"],"HONK","honk"),
    ]
    for words,command,name in specs:
        out += normalize_aliases(ask_uuid,words,command,f"{seed}-{name}")
    out += normalize_temp_aliases(ask_uuid,["22度","22 度","22°C"],22,seed+"-temp22")
    out += normalize_temp_aliases(ask_uuid,["23度","23 度","23°C"],23,seed+"-temp23")
    out += normalize_temp_aliases(ask_uuid,["24度","24 度","24°C"],24,seed+"-temp24")
    out += if_exact(
        cond_named_var("Command"),
        "NONE",
        [show("沒有辨識到這個指令，請再試一次。",seed+"-unknown"),exit_shortcut()],
        seed+"-unknown-gate"
    )
    return out

def confirm_command_action(prompt,action_factory,seed):
    # One canonical Tesla AppIntent is shared by touch and voice.
    # Voice asks for the exact word 「確認」; touch uses the normal confirm menu.
    out=[*set_variable("Confirmed","NO",seed+"-confirmed-init")]
    ask,ask_uuid=ask_text(prompt+" 請說「確認」或「取消」。",seed+"-voice-ask")
    voice_confirm=[
      ask,
      *if_exact(
          cond_action_output(ask_uuid,"Provided Input"),
          "確認",
          set_variable("Confirmed","YES",seed+"-voice-confirmed"),
          seed+"-voice-confirm"
      )
    ]
    out += if_exact(cond_named_var("VoiceMode"),"YES",voice_confirm,seed+"-voice-gate")
    touch_confirm=menu(prompt,["確認執行","取消"],{
      "確認執行":set_variable("Confirmed","YES",seed+"-touch-confirmed"),
      "取消":[show("已取消",seed+"-touch-cancel"),exit_shortcut()]
    },seed+"-touch-menu")
    out += if_exact(cond_named_var("VoiceMode"),"NO",touch_confirm,seed+"-touch-gate")
    out += if_exact(
        cond_named_var("Confirmed"),
        "YES",
        [action_factory(seed+"-action"),exit_shortcut()],
        seed+"-execute"
    )
    out += [show("已取消",seed+"-cancel"),exit_shortcut()]
    return out

def find_parked_car(seed):
    parked=uid(seed+"-parked")
    maps=uid(seed+"-maps")
    return [
      act("is.workflow.actions.getparkedcarlocation",{"UUID":parked}),
      act("is.workflow.actions.getmapslink",{"UUID":maps,"WFInput":ao(parked,"Parked Car Location")}),
      act("is.workflow.actions.openurl",{"UUID":uid(seed+"-open"),"WFInput":ao(maps,"Maps URL")})
    ]

# ---- touch menus: clean main screen + full remote-control submenu ----
temp_menu=menu("車室溫度",["22°C","23°C","24°C"],{
    "22°C":set_temp_command(22,"menu-temp22"),
    "23°C":set_temp_command(23,"menu-temp23"),
    "24°C":set_temp_command(24,"menu-temp24"),
},"temp-menu")

remote_climate_menu=menu("車外遙控｜空調 / 車室",[
    "開始預冷 / 預熱","停止預冷 / 預熱","設定溫度",
    "除霜","停止除霜","駕駛座加熱","關閉座椅加熱"
],{
    "開始預冷 / 預熱":set_command("PRE_START","remote-pre-start"),
    "停止預冷 / 預熱":set_command("PRE_STOP","remote-pre-stop"),
    "設定溫度":temp_menu,
    "除霜":set_command("DEFROST_ON","remote-defrost"),
    "停止除霜":set_command("DEFROST_OFF","remote-defrost-stop"),
    "駕駛座加熱":set_command("SEAT_HIGH","remote-seat-high"),
    "關閉座椅加熱":set_command("SEAT_OFF","remote-seat-off"),
},"remote-climate-menu")

remote_access_menu=menu("車外遙控｜門鎖 / 行李廂 / 車窗",[
    "鎖車","解鎖","前行李廂","開啟後車廂","車窗通風","關閉車窗"
],{
    "鎖車":set_command("LOCK","remote-lock"),
    "解鎖":set_command("UNLOCK","remote-unlock"),
    "前行李廂":set_command("FRUNK","remote-frunk"),
    "開啟後車廂":set_command("REAR","remote-rear"),
    "車窗通風":set_command("VENT","remote-vent"),
    "關閉車窗":set_command("WINDOW_CLOSE","remote-window-close"),
},"remote-access-menu")

remote_charge_menu=menu("車外遙控｜充電",[
    "開啟充電孔","關閉充電孔","充電上限 80%","充電上限 90%","Tesla App"
],{
    "開啟充電孔":set_command("CHARGE_PORT_OPEN","remote-charge-port-open"),
    "關閉充電孔":set_command("CHARGE_PORT_CLOSE","remote-charge-port-close"),
    "充電上限 80%":set_command("CHARGE_80","remote-charge80"),
    "充電上限 90%":set_command("CHARGE_90","remote-charge90"),
    "Tesla App":[app(BUNDLE,"remote-tesla-app-charge"),exit_shortcut()],
},"remote-charge-menu")

remote_security_menu=menu("車外遙控｜安全 / 尋車",[
    "哨兵模式","閃燈","鳴喇叭"
],{
    "哨兵模式":set_command("SENTRY","remote-sentry"),
    "閃燈":set_command("FLASH","remote-flash"),
    "鳴喇叭":set_command("HONK","remote-honk"),
},"remote-security-menu")

remote_menu=menu("車外遙控",[
    "空調 / 車室","門鎖 / 行李廂 / 車窗","充電","安全 / 尋車"
],{
    "空調 / 車室":remote_climate_menu,
    "門鎖 / 行李廂 / 車窗":remote_access_menu,
    "充電":remote_charge_menu,
    "安全 / 尋車":remote_security_menu,
},"remote-menu")

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
    "快速出發","車外遙控","導航","找充電站","停車 / 找車","行車工具","語音控制","Tesla App"
]
main_branches={
    "快速出發":set_prepare("menu-quick-start"),
    "車外遙控":remote_menu,
    "語音控制":voice_command_flow("menu-voice"),
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
    "WFCommentActionText":"CarKit TW｜特斯拉助手\n- 使用 iPhone 內建「捷徑」整理給 Tesla 車友免費使用\n- 一支捷徑整合觸控與語音，不需要另外安裝語音 Helper\n- 主畫面保留「車外遙控」與「語音控制」：人在車外可從 iPhone / AirPods / Siri 使用 Tesla App 既有遠端控制\n- 快速出發：先做出發前預先調節，再選 Apple 地圖、Google Maps 或 Waze 導航\n- 車外遙控包含空調、鎖解鎖、前後行李廂、車窗、哨兵、充電、閃燈與鳴喇叭\n- 解鎖、前行李廂、後車廂會再次要求確認，避免誤觸\n- 導航目的地每次自行輸入，不會預設住家或公司\n- 第一次加入時，iPhone 會依序請你替需要車輛的遠端控制指定 Tesla；單車車主都選同一台即可\n- ALLOW_MANUAL_UNIT_CONVERSION：Tesla 溫度控制直接使用攝氏數值，不進行單位換算"
  }),
  act("is.workflow.actions.comment",{
    "UUID":uid("header-validation"),
    "WFCommentActionText":"Shortcuts generated by Shortcuts Playground. May contain mistakes. Always check the shortcut's actions first.\n\nThis shortcut was created via the following user prompt:\n\n> CarKit TW｜Tesla 車友免費捷徑：單一特斯拉助手整合快速出發、車外遙控、語音控制、導航、找充電站、停車找車與台灣行車工具。"
  }),
  act("is.workflow.actions.comment",{
    "UUID":uid("vehicle-status"),
    "WFCommentActionText":"第一次設定\n需要指定車輛的 Tesla 原生動作會各自出現一次選車設定。單車車主請全部選同一台；多車帳號則依你希望這支捷徑控制的車輛選擇。"
  })
]

# User-facing shortcut: no Shortcut Input dependency. Automations must use separate helper shortcuts.

# Always initialize canonical command to empty text.
actions += set_command("NONE","command-init")
actions += set_variable("PrepareMode","NO","prepare-init")
actions += set_variable("VoiceMode","NO","voice-mode-init")

# Main interactive entry: one tap / Siri invocation goes straight to the menu.
actions += manual_menu

# ---- one canonical Tesla AppIntent per actual function; menus only set commands ----
cmd=cond_named_var("Command")
pre_start_flow=[
    pre_start_action("canonical-pre-start"),
    *if_exact(
        cond_named_var("PrepareMode"),
        "YES",
        [*quick_nav_menu],
        "canonical-pre-start-quick-nav"
    ),
    exit_shortcut()
]
actions += if_exact(cmd,"PRE_START",pre_start_flow,"run-pre-start")
actions += if_exact(cmd,"PRE_STOP",[pre_stop_action("canonical-pre-stop"),exit_shortcut()],"run-pre-stop")
actions += if_exact(cmd,"TEMP",[temp_action("canonical-temp"),exit_shortcut()],"run-temp")
actions += if_exact(cmd,"LOCK",[lock_action("canonical-lock"),exit_shortcut()],"run-lock")
actions += if_exact(cmd,"UNLOCK",confirm_command_action("確定要解鎖 Tesla？",unlock_action,"canonical-unlock"),"run-unlock")
actions += if_exact(cmd,"FRUNK",confirm_command_action("確定要開啟前行李廂？",frunk_action,"canonical-frunk"),"run-frunk")
actions += if_exact(cmd,"REAR",confirm_command_action("確定要開啟後車廂？",rear_action,"canonical-rear"),"run-rear")
actions += if_exact(cmd,"CHARGE_80",[charge_limit_action(80,"canonical-charge80"),exit_shortcut()],"run-charge80")
actions += if_exact(cmd,"CHARGE_90",[charge_limit_action(90,"canonical-charge90"),exit_shortcut()],"run-charge90")
actions += if_exact(cmd,"CHARGE_PORT_OPEN",[open_charge_port_action("canonical-charge-port-open"),exit_shortcut()],"run-charge-port-open")
actions += if_exact(cmd,"CHARGE_PORT_CLOSE",[close_charge_port_action("canonical-charge-port-close"),exit_shortcut()],"run-charge-port-close")
actions += if_exact(cmd,"FLASH",[flash_action("canonical-flash"),exit_shortcut()],"run-flash")
actions += if_exact(cmd,"HONK",[honk_action("canonical-honk"),exit_shortcut()],"run-honk")
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
