import json
import os
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright


url = os.environ.get("DASHBOARD_URL", "http://127.0.0.1:4173/")
repo_root = Path(__file__).resolve().parents[1]
expected_report = json.loads((repo_root / "data" / "dashboard" / "factor_research_latest.json").read_text(encoding="utf-8"))
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

    assert ranking_rows == 10, f"expected 10 composite ranking rows, got {ranking_rows}"
    assert evidence_rows == 10, f"expected 10 horizon/factor evidence rows, got {evidence_rows}"
    assert expected_top["symbol"] in ranking_text and expected_top["name"] in ranking_text, "latest official top-ranked stock did not render"
    assert factor_as_of == expected_report["asOf"], f"unexpected factor as-of: {factor_as_of}"
    assert factor_status == expected_status, f"unexpected factor OOS status: {factor_status}"
    assert evidence_note == expected_report["forwardEvidence"]["reason"]
    assert not console_errors, f"browser console errors: {console_errors}"
    assert not failed_requests, f"failed browser requests: {failed_requests}"
    assert not http_errors, f"HTTP errors: {http_errors}"

    page.screenshot(path=str(screenshot_path), full_page=True)
    browser.close()

print(json.dumps({
    "ok": True,
    "rankingRows": ranking_rows,
    "evidenceRows": evidence_rows,
    "factorAsOf": factor_as_of,
    "factorStatus": factor_status,
    "screenshot": str(screenshot_path),
}, ensure_ascii=False))
