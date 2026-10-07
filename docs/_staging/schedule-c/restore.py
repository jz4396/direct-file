#!/usr/bin/env python3
import gzip, base64, pathlib, sys
root = pathlib.Path("docs/_staging/schedule-c")
dest = pathlib.Path("direct-file/backend/src/main/resources/tax")
dest.mkdir(parents=True, exist_ok=True)
ok = True
for name in ["flow.xml", "income.xml", "taxCalculations.xml", "scheduleC.xml", "scheduleSE.xml"]:
    p = root / f"{name}.gz.b64"
    if not p.exists():
        print("skip missing", name)
        continue
    try:
        data = gzip.decompress(base64.b64decode(p.read_text().strip()))
        (dest / name).write_bytes(data)
        text = data.decode(errors="ignore")
        print(name, len(data),
              "QBI" if "flowKnockoutScheduleCQbi" in text else "-",
              "net" if "scheduleCNetProfitOrLoss" in text else "-",
              "SE" if "selfEmploymentTax" in text else "-")
        if name == "flow.xml" and "PLACEHOLDER" in text:
            print("ERROR: flow still placeholder", file=sys.stderr)
            ok = False
    except Exception as e:
        print("FAIL", name, e, file=sys.stderr)
        ok = False
if not ok:
    sys.exit(1)
