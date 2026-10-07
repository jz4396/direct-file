#!/usr/bin/env python3
import gzip, base64, pathlib, sys, traceback
root = pathlib.Path("docs/_staging/schedule-c")
dest = pathlib.Path("direct-file/backend/src/main/resources/tax")
dest.mkdir(parents=True, exist_ok=True)
written = []
failed = []
for name in ["flow.xml", "income.xml", "taxCalculations.xml", "scheduleC.xml", "scheduleSE.xml"]:
    p = root / f"{name}.gz.b64"
    if not p.exists():
        print("skip missing", name)
        continue
    try:
        raw_b64 = p.read_text().strip()
        data = gzip.decompress(base64.b64decode(raw_b64))
        out = dest / name
        out.write_bytes(data)
        text = data.decode(errors="ignore")
        print(name, len(data),
              "QBI" if "flowKnockoutScheduleCQbi" in text else "-",
              "net" if "scheduleCNetProfitOrLoss" in text else "-",
              "SE" if "selfEmploymentTax" in text else "-")
        if "PLACEHOLDER" in text or text.startswith("file:"):
            raise RuntimeError(f"{name} decoded to placeholder/path")
        written.append(name)
    except Exception as e:
        print("FAIL", name, e, file=sys.stderr)
        traceback.print_exc()
        failed.append(name)
print("written", written, "failed", failed)
need = {"flow.xml", "income.xml", "taxCalculations.xml"}
if not need.issubset(set(written)):
    sys.exit(1)
