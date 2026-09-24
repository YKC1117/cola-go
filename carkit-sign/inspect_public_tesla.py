#!/usr/bin/env python3
import json, plistlib, re
from pathlib import Path
from urllib.request import Request, urlopen

DONORS={
    "a857a015118742b3ad7fafa48afd42ce":"reddit-tesla-mega-menu",
    "fdc8e8e4e97f4a3689378d4793522c53":"reddit-action-button-menu",
}
OUT=Path("carkit-sign/inspect")
OUT.mkdir(parents=True,exist_ok=True)
all_out={}

def clean(v):
    if isinstance(v,dict):
        return {k:clean(x) for k,x in v.items()}
    if isinstance(v,list):
        return [clean(x) for x in v]
    if isinstance(v,str):
        if re.fullmatch(r"[A-HJ-NPR-Z0-9]{17}",v):
            return "<REDACTED_VIN>"
        if "intents-remote-image-proxy" in v:
            return "<REDACTED_REMOTE_IMAGE>"
    return v

for sid,label in DONORS.items():
    api=f"https://www.icloud.com/shortcuts/api/records/{sid}"
    with urlopen(Request(api,headers={"User-Agent":"Mozilla/5.0"}),timeout=30) as r:
        meta=json.load(r)
    rec=meta["records"][0] if isinstance(meta,dict) and "records" in meta else meta
    fields=rec["fields"]
    name=fields.get("name",{}).get("value",label)
    url=fields["shortcut"]["value"]["downloadURL"].replace("$"+"{f}","shortcut.plist")
    with urlopen(Request(url,headers={"User-Agent":"Mozilla/5.0"}),timeout=60) as r:
        raw=r.read()
    wf=plistlib.loads(raw)

    actions=[]
    tesla=[]
    for i,a in enumerate(wf.get("WFWorkflowActions",[])):
        ident=a.get("WFWorkflowActionIdentifier","")
        params=a.get("WFWorkflowActionParameters",{})
        row={"index":i,"identifier":ident,"params":clean(params)}
        actions.append(row)
        blob=json.dumps(row,ensure_ascii=False,default=str).lower()
        if "tesla" in blob or "com.teslamotors" in blob:
            tesla.append(row)

    imports=clean(wf.get("WFWorkflowImportQuestions",[]))
    all_out[sid]={
        "label":label,
        "name":name,
        "action_count":len(actions),
        "import_questions":imports,
        "tesla_actions":tesla,
    }
    print("\nDONOR",sid,label,"NAME",name,"ACTIONS",len(actions),"TESLA",len(tesla))
    for row in tesla:
        p=row["params"]
        desc=p.get("AppIntentDescriptor",{})
        print("TESLA_ACTION",row["index"],row["identifier"])
        print("  INTENT",desc.get("AppIntentIdentifier"))
        print("  KEYS",sorted(k for k in p if k not in {"UUID","AppIntentDescriptor"}))
        print("  PARAMS",json.dumps(p,ensure_ascii=False,default=str)[:4000])
    if imports:
        print("IMPORT_QUESTIONS",json.dumps(imports,ensure_ascii=False,default=str)[:6000])

Path("carkit-sign/inspect/public-tesla-donors-redacted.json").write_text(
    json.dumps(all_out,ensure_ascii=False,indent=2,default=str),
    encoding="utf-8"
)
