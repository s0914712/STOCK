#!/usr/bin/env python3
from __future__ import annotations

from io import BytesIO
import urllib.request
import pandas as pd

URL = "https://www.cbc.gov.tw/tw/public/data/a13rate.xls"
req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 STOCK-leverage-research/1.0"})
with urllib.request.urlopen(req, timeout=30) as resp:
    data = resp.read()
print("downloaded", len(data), "bytes")
books = pd.read_excel(BytesIO(data), sheet_name=None, header=None, engine="xlrd")
for name, df in books.items():
    print("\nSHEET", repr(name), "shape", df.shape)
    print(df.head(35).to_string(index=True, header=True))
