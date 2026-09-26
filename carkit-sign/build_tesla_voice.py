import plistlib, uuid
from pathlib import Path

OUT=Path("carkit-sign/generated")
OUT.mkdir(parents=True, exist_ok=True)

VERSION="1.4"
TEAM="PS9EBAM2PU"
BUNDLE="com.teslamotors.TeslaApp"

def uid(seed):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"CarKitTW/TeslaVoice/v{VERSION}/"+seed)).upper()

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

def act(identifier, params=None):
    return {"WFWorkflowActionIdentifier":identifier,"WFWorkflowActionParameters":params or {}}

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
        "WFCommentActionText":f"語音精確比對「{value}」\\n- 符合：執行對應 Tesla 功能\\n- 不符合：繼續比對下一個指令"
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

def set_variable(name,value,seed):
    t=uid(seed+"-text")
    return [
      act("is.workflow.actions.gettext",{"UUID":t,"WFTextActionText":value}),
      act("is.workflow.actions.setvariable",{
        "UUID":uid(seed+"-set"),
        "WFVariableName":name,
        "WFInput":ao(t,"Text")
      })
    ]

def set_number_variable(name,value,seed):
    n=uid(seed+"-number")
    return [
      act("is.workflow.actions.number",{"UUID":n,"WFNumberActionNumber":str(value)}),
      act("is.workflow.actions.setvariable",{
        "UUID":uid(seed+"-set"),
        "WFVariableName":name,
        "WFInput":ao(n,"Number")
      })
    ]

def set_command(value,seed):
    return set_variable("Command",value,seed)

def set_temp_command(value,seed):
    return [
      *set_number_variable("Temp",value,seed+"-value"),
      *set_command("TEMP",seed+"-command")
    ]

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
    if vehicle_mode=="ask":
        p["vehicle"]=ask_token()
    elif vehicle_mode not in (False,None):
        raise ValueError("Unsupported vehicle mode")
    if extra:
        p.update(extra)
    if show_when_run is not None:
        p["ShowWhenRun"]=show_when_run
    return act(f"{BUNDLE}.{intent}",p)

def lock_action(seed):
    return tesla("LockUnlockIntent",seed,{"vehicleControlType":"lock"})

def unlock_action(seed):
    return tesla("LockUnlockIntent",seed,{"vehicleControlType":"unlock"})

def frunk_action(seed):
    return tesla("FrontTrunkIntent",seed)

def rear_action(seed):
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
    return tesla("HVACSeatHeaterIntent",seed,{"seat":"frontLeft","level":"high"},vehicle_mode=False,show_when_run=False)

def seat_heater_off_action(seed):
    return tesla("HVACSeatHeaterIntent",seed,{"seat":"frontLeft","level":"off"},vehicle_mode=False,show_when_run=False)

def open_charge_port_action(seed):
    return tesla("ChargePortIntent",seed,{"chargePortAction":"open"},vehicle_mode=False)

def close_charge_port_action(seed):
    return tesla("ChargePortIntent",seed,{"chargePortAction":"close"},vehicle_mode=False)

def honk_action(seed):
    return tesla("HonkIntent",seed,vehicle_mode=False)

def flash_action(seed):
    return tesla("FlashLightIntent",seed,vehicle_mode=False)

def vent_action(seed):
    return tesla("VentIntent",seed)

def close_window_action(seed):
    return tesla("CloseWindowIntent",seed)

def sentry_action(seed):
    return tesla("SentryModeIntent",seed,{"vehicleModeAction":ask_token()})

def temp_action(seed):
    return tesla("HVACSetTempIntent",seed,{
      "temperature":{
        "Value":{"Unit":"°C","Magnitude":{"VariableName":"Temp","Type":"Variable"}},
        "WFSerializationType":"WFQuantityFieldValue"
      }
    },show_when_run=False)

def charge_limit_action(pct,seed):
    return tesla("ChargeLimitIntent",seed,{"percent":str(pct)},vehicle_mode=False,show_when_run=False)

def normalize_aliases(input_uuid,aliases,command_actions,seed):
    out=[]
    for i,word in enumerate(aliases):
        out += if_exact(
            cond_action_output(input_uuid,"Provided Input"),
            word,
            command_actions(f"{seed}-set-{i}"),
            f"{seed}-alias-{i}"
        )
    return out

def command_setter(command):
    return lambda seed: set_command(command,seed)

def temp_setter(value):
    return lambda seed: set_temp_command(value,seed)

def voice_confirm(prompt,action_factory,seed):
    ask,u=ask_text(prompt+" 請說「確認」或「取消」。",seed+"-ask")
    return [
      ask,
      *if_exact(
        cond_action_output(u,"Provided Input"),
        "確認",
        [action_factory(seed+"-confirmed"),exit_shortcut()],
        seed+"-yes"
      ),
      show("已取消",seed+"-cancel"),
      exit_shortcut()
    ]

actions=[
  act("is.workflow.actions.comment",{
    "UUID":uid("header"),
    "WFCommentActionText":"CarKit TW｜特斯拉語音控制 v1.4\n- 給人在車外時用 iPhone / AirPods / Apple Watch 的 Siri 操作\n- 對 Siri 說「特斯拉語音控制」，再回答要做的功能\n- 支援空調、溫度、門鎖、前後行李廂、車窗、充電、哨兵、閃燈與鳴喇叭\n- 解鎖、前行李廂、後車廂一定會再問一次確認\n- ALLOW_MANUAL_UNIT_CONVERSION：Tesla 溫度控制直接使用攝氏數值，不進行單位換算"
  }),
  act("is.workflow.actions.comment",{
    "UUID":uid("provenance"),
    "WFCommentActionText":"Shortcuts generated by Shortcuts Playground. May contain mistakes. Always check the shortcut's actions first.\n\nThis shortcut was created via the following user prompt:\n\n> CarKit TW｜Tesla 車外 Siri 語音 Helper：用一句 Siri 呼叫後，以語音選擇 Tesla 原生遠端控制。"
  }),
  act("is.workflow.actions.comment",{
    "UUID":uid("help"),
    "WFCommentActionText":"可以說：預冷、停止預冷、22度、23度、24度、除霜、停止除霜、座椅加熱、關閉座椅加熱、鎖車、解鎖、前行李廂、後車廂、車窗通風、關閉車窗、開充電孔、關充電孔、充電80、充電90、哨兵、閃燈、鳴喇叭。"
  })
]

actions += set_command("NONE","init")
ask,u=ask_text("要控制 Tesla 什麼功能？", "voice-command")
actions.append(ask)

aliases=[
  (["預冷","預熱","開始預冷","開始預熱","開冷氣"],command_setter("PRE_START"),"pre-start"),
  (["停止預冷","停止預熱","關冷氣"],command_setter("PRE_STOP"),"pre-stop"),
  (["22度","22 度","22°C"],temp_setter(22),"temp22"),
  (["23度","23 度","23°C"],temp_setter(23),"temp23"),
  (["24度","24 度","24°C"],temp_setter(24),"temp24"),
  (["除霜","開除霜"],command_setter("DEFROST_ON"),"defrost-on"),
  (["停止除霜","關除霜"],command_setter("DEFROST_OFF"),"defrost-off"),
  (["座椅加熱","駕駛座加熱"],command_setter("SEAT_HIGH"),"seat-high"),
  (["關閉座椅加熱","關座椅加熱"],command_setter("SEAT_OFF"),"seat-off"),
  (["鎖車","上鎖"],command_setter("LOCK"),"lock"),
  (["解鎖"],command_setter("UNLOCK"),"unlock"),
  (["前行李廂","開前行李廂"],command_setter("FRUNK"),"frunk"),
  (["後車廂","開後車廂","後行李廂"],command_setter("REAR"),"rear"),
  (["車窗通風","通風"],command_setter("VENT"),"vent"),
  (["關閉車窗","關窗"],command_setter("WINDOW_CLOSE"),"window-close"),
  (["開充電孔","打開充電孔"],command_setter("CHARGE_PORT_OPEN"),"charge-open"),
  (["關充電孔","關閉充電孔"],command_setter("CHARGE_PORT_CLOSE"),"charge-close"),
  (["充電80","充電 80","充電80%","充電上限80"],command_setter("CHARGE_80"),"charge80"),
  (["充電90","充電 90","充電90%","充電上限90"],command_setter("CHARGE_90"),"charge90"),
  (["哨兵","哨兵模式"],command_setter("SENTRY"),"sentry"),
  (["閃燈"],command_setter("FLASH"),"flash"),
  (["鳴喇叭","喇叭","按喇叭"],command_setter("HONK"),"honk"),
]
for words,setter,seed in aliases:
    actions += normalize_aliases(u,words,setter,seed)

cmd=cond_named_var("Command")
actions += if_exact(cmd,"PRE_START",[pre_start_action("run-pre-start"),exit_shortcut()],"run-pre-start")
actions += if_exact(cmd,"PRE_STOP",[pre_stop_action("run-pre-stop"),exit_shortcut()],"run-pre-stop")
actions += if_exact(cmd,"TEMP",[temp_action("run-temp"),exit_shortcut()],"run-temp")
actions += if_exact(cmd,"DEFROST_ON",[defrost_action("run-defrost-on"),exit_shortcut()],"run-defrost-on")
actions += if_exact(cmd,"DEFROST_OFF",[defrost_stop_action("run-defrost-off"),exit_shortcut()],"run-defrost-off")
actions += if_exact(cmd,"SEAT_HIGH",[seat_heater_high_action("run-seat-high"),exit_shortcut()],"run-seat-high")
actions += if_exact(cmd,"SEAT_OFF",[seat_heater_off_action("run-seat-off"),exit_shortcut()],"run-seat-off")
actions += if_exact(cmd,"LOCK",[lock_action("run-lock"),exit_shortcut()],"run-lock")
actions += if_exact(cmd,"UNLOCK",voice_confirm("確定要解鎖 Tesla？",unlock_action,"run-unlock"),"route-unlock")
actions += if_exact(cmd,"FRUNK",voice_confirm("確定要開啟前行李廂？",frunk_action,"run-frunk"),"route-frunk")
actions += if_exact(cmd,"REAR",voice_confirm("確定要開啟後車廂？",rear_action,"run-rear"),"route-rear")
actions += if_exact(cmd,"VENT",[vent_action("run-vent"),exit_shortcut()],"run-vent")
actions += if_exact(cmd,"WINDOW_CLOSE",[close_window_action("run-window-close"),exit_shortcut()],"run-window-close")
actions += if_exact(cmd,"CHARGE_PORT_OPEN",[open_charge_port_action("run-charge-port-open"),exit_shortcut()],"run-charge-port-open")
actions += if_exact(cmd,"CHARGE_PORT_CLOSE",[close_charge_port_action("run-charge-port-close"),exit_shortcut()],"run-charge-port-close")
actions += if_exact(cmd,"CHARGE_80",[charge_limit_action(80,"run-charge80"),exit_shortcut()],"run-charge80")
actions += if_exact(cmd,"CHARGE_90",[charge_limit_action(90,"run-charge90"),exit_shortcut()],"run-charge90")
actions += if_exact(cmd,"SENTRY",[sentry_action("run-sentry"),exit_shortcut()],"run-sentry")
actions += if_exact(cmd,"FLASH",[flash_action("run-flash"),exit_shortcut()],"run-flash")
actions += if_exact(cmd,"HONK",[honk_action("run-honk"),exit_shortcut()],"run-honk")
actions += [show("沒有辨識到這個指令，請再試一次。","unknown"),exit_shortcut()]

intent_labels={
  "PreconditionIntent":"預冷 / 預熱",
  "HVACSetTempIntent":"車室溫度",
  "LockUnlockIntent":"車門鎖",
  "FrontTrunkIntent":"前行李廂",
  "RearTrunkIntent":"後車廂",
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

questions=[]
total=len(vehicle_indexes)
for number,(index,intent) in enumerate(vehicle_indexes,1):
    label=intent_labels.get(intent,intent)
    questions.append({
      "Category":"Parameter",
      "ParameterKey":"vehicle",
      "ActionIndex":index,
      "Text":f"語音控制設定 {number}/{total}｜請選擇 Tesla：{label}"
    })

wf={
 "WFWorkflowClientVersion":"3400.0",
 "WFWorkflowMinimumClientVersion":900,
 "WFWorkflowMinimumClientVersionString":"900",
 "WFWorkflowTypes":["NCWidget","WatchKit"],
 "WFWorkflowOutputContentItemClasses":[],
 "WFWorkflowName":"特斯拉語音控制",
 "WFWorkflowIcon":{"WFWorkflowIconGlyphNumber":61447,"WFWorkflowIconStartColor":4274264319},
 "WFWorkflowActions":actions,
 "WFWorkflowImportQuestions":questions,
}

data=plistlib.dumps(wf,fmt=plistlib.FMT_XML,sort_keys=False)
p=OUT/"特斯拉語音控制.shortcut.xml"
p.write_bytes(data)
print(p,"actions",len(actions),"vehicle_import_questions",len(questions),"bytes",len(data))
