# 讀簡報 PDF

Read 工具需要 pdftoppm；這台機器沒有。用 PyMuPDF 在 scratchpad 建 venv：

```bash
cd "$SCRATCHPAD" && python3 -m venv pdfenv && ./pdfenv/bin/pip install -q pymupdf
./pdfenv/bin/python - <<'PY'
import pymupdf, os
d = pymupdf.open("/path/to/deck.pdf")
os.makedirs("deck", exist_ok=True)
for i, p in enumerate(d, 1):
    p.get_pixmap(dpi=120).save(f"deck/p{i:02d}.png")
    print(f"===== PAGE {i} =====\n{p.get_text().strip()[:1500]}")
PY
```

簡報通常是圖，文字層很薄，要用 Read 逐頁看 PNG。看的時候記：每頁的主張、數字、畫面上的欄位與狀態、跟程式碼或最新文件不符的地方。
