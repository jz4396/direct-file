# Schedule C staging payloads (gap #3)

Gzip+base64 of patched flow.xml, income.xml, taxCalculations.xml (MCP size limits).

Decode locally or run workflow `restore-schedule-c-tax-xml`:
```
python3 -c "import gzip,base64,pathlib;n='flow.xml';pathlib.Path(n).write_bytes(gzip.decompress(base64.b64decode(pathlib.Path(n+'.gz.b64').read_text())));print(n)"
```

Trigger: workflow_dispatch or push under docs/_staging/schedule-c/
