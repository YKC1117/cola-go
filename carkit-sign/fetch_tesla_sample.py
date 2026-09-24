#!/usr/bin/env python3
import json, plistlib, urllib.request, urllib.error, sys
from pathlib import Path

sid="3c461b592b644b3cb158a9f98db225c9"
urls=[
    f"https://www.icloud.com/shortcuts/api/records/{sid}",
    f"https://www.icloud.com/shortcuts/api/v1/records/{sid}",
]
meta=None
chosen=None
for u in urls:
    try:
        req=urllib.request.Request(u,headers={"User-Agent":"Mozilla/5.0"})
        with urllib.request.urlopen(req,timeout=30) as r:
            body=r.read()
        print("META URL:",u,"status ok","bytes",len(body),"prefix",repr(body[:200]))
        obj=json.loads(body)
        print("META KEYS:",list(obj.keys()))
        print(json.dumps(obj,ensure_ascii=False)[:3000])
        # accept old {records:[...]} or direct record
        if "records" in obj and obj["records"]:
            meta=obj["records"][0]
            chosen=u
            break
        if "fields" in obj:
            meta=obj
            chosen=u
            break
    except Exception as e:
        print("META FAIL:",u,repr(e))

if not meta:
    raise SystemExit("No usable iCloud shortcut metadata")

Path("carkit-sign/tesla-sample-meta.json").write_text(
    json.dumps(meta,ensure_ascii=False,indent=2),encoding="utf-8"
)
fields=meta["fields"]
shortcut_field=fields.get("shortcut") or fields.get("shortcut_file") or fields.get("file")
if not shortcut_field:
    raise SystemExit("No shortcut asset field; fields="+",".join(fields.keys()))
value=shortcut_field.get("value",shortcut_field)
download=value.get("downloadURL") or value.get("downloadUrl") or value.get("url")
if not download:
    raise SystemExit("No download URL in shortcut asset: "+json.dumps(shortcut_field)[:1000])
print("CHOSEN:",chosen)
print("DOWNLOAD:",download)

req=urllib.request.Request(download,headers={"User-Agent":"Mozilla/5.0"})
with urllib.request.urlopen(req,timeout=60) as r:
    data=r.read()
Path("carkit-sign/tesla-sample.raw").write_bytes(data)
print("ASSET bytes:",len(data),"header:",repr(data[:32]))

try:
    obj=plistlib.loads(data)
except Exception as e:
    print("PLIST parse failed:",repr(e))
    # Keep the raw asset for later AEA1 unpacking if necessary.
    raise SystemExit(3)

Path("carkit-sign/tesla-sample.plist.xml").write_bytes(
    plistlib.dumps(obj,fmt=plistlib.FMT_XML,sort_keys=False)
)
actions=obj.get("WFWorkflowActions",[])
print("ACTION COUNT:",len(actions))
for i,a in enumerate(actions):
    ident=a.get("WFWorkflowActionIdentifier")
    params=a.get("WFWorkflowActionParameters",{})
    blob=json.dumps(params,ensure_ascii=False,default=str)
    if any(k.lower() in blob.lower() for k in ["tesla","temperature","appintent","set temperatures"]):
        print("\nTESLA ACTION",i,ident)
        print(json.dumps(params,ensure_ascii=False,indent=2,default=str))
