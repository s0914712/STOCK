import json
import os
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright


url = os.environ.get("DASHBOARD_URL", "http://127.0.0.1:4173/")
repo_root = Path(__file__).resolve().parents[1]
expected_report = json.loads((repo_root / "data" / "dashboard" / "factor_research_latest.json").read_text(encoding="utf-8"))
challenger_report = json.loads((repo_root / "data" / "shadow" / "challenger_latest.json").read_text(encoding="utf-8"))
baseline_report = json.loads((repo_root / "data" / "shadow" / "latest.json").read_text(encoding="utf-8"))
representative_report = json.loads((repo_root / "data" / "dashboard" / "sector_representatives_latest.json").read_text(encoding="utf-8"))
expected_top = expected_report["rankings"]["composite"][0]
expected_status = "可進一步審查" if expected_report["forwardEvidence"]["status"] == "eligible-for-research-review" else "累積中"
screenshot_path = Path(os.environ.get(
    "DASHBOARD_SCREENSHOT",
    str(Path(tempfile.gettempdir()) / "stock-factor-dashboard-smoke.png"),
))

console_errors = []
failed_requests = []
http_errors = []

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=1)
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.on("requestfailed", lambda request: failed_requests.append({
        "url": request.url,
        "failure": request.failure,
    }))
    page.on("response", lambda response: http_errors.append({
        "url": response.url,
        "status": response.status,
    }) if response.status >= 400 else None)

    response = page.goto(url, wait_until="networkidle")
    assert response and response.ok, f"dashboard navigation failed: {response.status if response else 'no response'}"
    page.locator("#factor-body tr").first.wait_for(state="visible")

    ranking_rows = page.locator("#factor-body tr").count()
    evidence_rows = page.locator("#factor-evidence-body tr").count()
    ranking_text = page.locator("#factor-body").inner_text()
    evidence_note = page.locator("#factor-evidence-note").inner_text()
    factor_as_of = page.locator("#factor-as-of").inner_text()
    factor_status = page.locator("#factor-oos-status").inner_text()
    prediction_rows = page.locator("#prediction-body tr")
    prediction_row_count = prediction_rows.count()
    allocation_cells = prediction_rows.first.locator("td")

    assert ranking_rows == 10, f"expected 10 composite ranking rows, got {ranking_rows}"
    assert evidence_rows == 10, f"expected 10 horizon/factor evidence rows, got {evidence_rows}"
    assert prediction_row_count == 7, f"expected allocation summary plus 6 sector rows, got {prediction_row_count}"
    assert allocation_cells.count() == 6 and "配置權重前二" in allocation_cells.nth(0).inner_text()
    anchors = {
        row["sector"]: sorted(anchor["symbol"] for anchor in row["anchors"])
        for row in baseline_report["latestPrediction"]["sectors"]
    }
    for model_index, model in enumerate(["baseline", "lightgbm", "xgboost"], start=2):
        sectors = challenger_report["latestPrediction"]["sectors"]
        probability_total = sum(row[model] for row in sectors if row["sector"] in anchors)
        weighted = sorted(
            (
                (row[model] / probability_total / len(anchors[row["sector"]]), symbol)
                for row in sectors
                if row["sector"] in anchors
                for symbol in anchors[row["sector"]]
            ),
            key=lambda item: (-item[0], item[1]),
        )[:2]
        cell_text = allocation_cells.nth(model_index).inner_text()
        for weight, symbol in weighted:
            assert symbol in cell_text and f"{weight * 100:.2f}%" in cell_text, f"{model} allocation leader missing: {symbol}"
    rendered_sector_rows = {
        row.locator("td").nth(0).inner_text(): row.locator("td").nth(1).inner_text()
        for row in prediction_rows.all()[1:]
    }
    for representative in representative_report["sectors"]:
        cell_text = rendered_sector_rows[representative["sector"]]
        assert representative["symbol"] in cell_text and representative["name"] in cell_text
        assert f"{representative['tradeValue'] / 100_000_000:.1f} 億" in cell_text
    assert expected_top["symbol"] in ranking_text and expected_top["name"] in ranking_text, "latest official top-ranked stock did not render"
    assert factor_as_of == expected_report["asOf"], f"unexpected factor as-of: {factor_as_of}"
    assert factor_status == expected_status, f"unexpected factor OOS status: {factor_status}"
    assert evidence_note == expected_report["forwardEvidence"]["reason"]
    page.screenshot(path=str(screenshot_path), full_page=True)
    page.set_viewport_size({"width": 390, "height": 844})
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "mobile page has horizontal body overflow"
    assert prediction_rows.first.is_visible(), "allocation summary is hidden on mobile"
    guide_link = page.get_by_role("link", name="時間序列分析入門 →")
    assert guide_link.is_visible()
    with page.expect_navigation(wait_until="networkidle"):
        guide_link.click()
    assert "時間序列分析" in page.locator("h1").inner_text()
    assert not console_errors, f"browser console errors: {console_errors}"
    assert not failed_requests, f"failed browser requests: {failed_requests}"
    assert not http_errors, f"HTTP errors: {http_errors}"
    browser.close()

print(json.dumps({
    "ok": True,
    "rankingRows": ranking_rows,
    "evidenceRows": evidence_rows,
    "predictionRows": prediction_row_count,
    "representativeStocks": len(representative_report["sectors"]),
    "factorAsOf": factor_as_of,
    "factorStatus": factor_status,
    "screenshot": str(screenshot_path),
}, ensure_ascii=False))
