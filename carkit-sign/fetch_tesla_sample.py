#!/usr/bin/env python3
import json, plistlib, urllib.request, sys
from pathlib import Path

sid="3c461b592b644b3cb158a9f98db225c9"
meta_url=f"https://www.icloud.com/shortcuts/api/records/{sid}"
req=urllib.request.Request(meta_url,headers={"User-Agent":"Mozilla/5.0"})
with urllib.request.urlopen(req,timeout=30) as r:
    meta=json.load(r)

Path("carkit-sign/tesla-sample-meta.json").write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding="utf-8")
rec=meta["records"][0]
download=rec["fields"]["shortcut"]["value"]["downloadURL"]
print("downloadURL:",download)
req=urllib.request.Request(download,headers={"User-Agent":"Mozilla/5.0"})
with urllib.request.urlopen(req,timeout=60) as r:
    data=r.read()
Path("carkit-sign/tesla-sample.raw").write_bytes(data)
print("bytes:",len(data),"header:",data[:16])

try:
    obj=plistlib.loads(data)
except Exception as e:
    print("plist parse failed:",repr(e))
    sys.exit(2)

Path("carkit-sign/tesla-sample.plist.xml").write_bytes(
    plistlib.dumps(obj,fmt=plistlib.FMT_XML,sort_keys=False)
)
actions=obj.get("WFWorkflowActions",[])
print("action count:",len(actions))
for i,a in enumerate(actions):
    ident=a.get("WFWorkflowActionIdentifier")
    params=a.get("WFWorkflowActionParameters",{})
    blob=json.dumps(params,ensure_ascii=False,default=str)
    if "Tesla" in blob or "tesla" in blob.lower() or "Temperature" in blob or "AppIntent" in blob:
        print("\nACTION",i,ident)
        print(json.dumps(params,ensure_ascii=False,indent=2,default=str))
