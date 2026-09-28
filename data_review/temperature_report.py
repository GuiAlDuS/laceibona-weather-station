"""Builds results/temperature.html: the temperature comparison with nearby stations, as a page with charts.

Runs temperature.py's compute() for the numbers and fills temperature_template.html.
    python3 data_review/temperature_report.py
"""
import json
import os
import runpy

HERE = os.path.dirname(os.path.abspath(__file__))
page = runpy.run_path(os.path.join(HERE, "temperature.py"))["compute"]()

tpl = open(os.path.join(HERE, "temperature_template.html")).read()
out = os.path.join(HERE, "results", "temperature.html")
open(out, "w").write(tpl.replace("/*DATA*/null", json.dumps(page, separators=(",", ":"))))
print(f"wrote {out} ({os.path.getsize(out) // 1024} KB)")
