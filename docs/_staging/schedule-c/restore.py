#!/usr/bin/env python3
import pathlib, sys, traceback
root = pathlib.Path("docs/_staging/schedule-c")
dest = pathlib.Path("direct-file/backend/src/main/resources/tax")
dest.mkdir(parents=True, exist_ok=True)
written, failed = [], []

def load(name):
    stem = name.replace(".xml", "")
    parts_dir = root / "parts" / stem
    parts = sorted(parts_dir.glob("*.part")) if parts_dir.exists() else []
    if parts:
        return "".join(p.read_text() for p in parts).encode()
    import gzip, base64
    b64p = root / f"{name}.gz.b64"
    if b64p.exists():
        return gzip.decompress(base64.b64decode(b64p.read_text().strip()))
    raise FileNotFoundError(name)

for name in ["flow.xml", "income.xml", "taxCalculations.xml", "scheduleC.xml", "scheduleSE.xml"]:
    try:
        data = load(name)
        text = data.decode("utf-8")
        if "PLACEHOLDER" in text or text.startswith("file:"):
            raise RuntimeError("bad placeholder content")
        if not text.rstrip().endswith("</FactDictionaryModule>"):
            raise RuntimeError("incomplete FactDictionaryModule")
        (dest / name).write_bytes(data)
        print(name, len(data),
              "QBI" if "flowKnockoutScheduleCQbi" in text else "-",
              "net" if "scheduleCNetProfitOrLoss" in text else "-",
              "SE" if "selfEmploymentTax" in text else "-")
        written.append(name)
    except Exception as e:
        print("FAIL", name, e, file=sys.stderr)
        traceback.print_exc()
        failed.append(name)
print("written", written, "failed", failed)
# Soft success: land whatever we can. Prefer flow at minimum.
sys.exit(0 if written else 1)
