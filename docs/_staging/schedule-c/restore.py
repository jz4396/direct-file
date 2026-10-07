#!/usr/bin/env python3
import pathlib, sys, traceback
root = pathlib.Path("docs/_staging/schedule-c")
dest = pathlib.Path("direct-file/backend/src/main/resources/tax")
dest.mkdir(parents=True, exist_ok=True)
written, failed = [], []

def load(name):
    stem = name.replace(".xml", "")
    single = root / "parts" / stem / "00000.part"
    if single.exists():
        return single.read_bytes()
    parts_dir = root / "parts" / stem
    if parts_dir.exists() and any(parts_dir.glob("*.part")):
        return "".join(p.read_text() for p in sorted(parts_dir.glob("*.part"))).encode()
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
need = {"flow.xml", "income.xml", "taxCalculations.xml"}
sys.exit(0 if need.issubset(set(written)) else 1)
