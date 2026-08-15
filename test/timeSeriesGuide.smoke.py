import json
import os
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright


url = os.environ.get("TIME_SERIES_GUIDE_URL", "http://127.0.0.1:42735/time-series-guide.html")
artifact_dir = Path(tempfile.gettempdir())
console_errors = []
page_errors = []
failed_requests = []
http_errors = []


def attach_diagnostics(page):
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    page.on("requestfailed", lambda request: failed_requests.append({"url": request.url, "failure": request.failure}))
    page.on("response", lambda response: http_errors.append({"url": response.url, "status": response.status})
            if response.status >= 400 else None)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)

    desktop = browser.new_page(viewport={"width": 1440, "height": 1000})
    attach_diagnostics(desktop)
    response = desktop.goto(url, wait_until="networkidle")
    assert response and response.ok
    assert "時間序列分析" in desktop.locator("h1").inner_text()
    assert desktop.locator(".toc a").count() == 10
    assert desktop.locator(".method-table tbody tr").count() == 11
    assert desktop.locator("#project-example").get_by_text("至少 6 個後續快照").is_visible()
    assert desktop.locator("a[href='./']").count() >= 2
    desktop_overflow = desktop.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
    assert not desktop_overflow, "desktop page has body-level horizontal overflow"
    desktop.screenshot(path=str(artifact_dir / "time-series-guide-desktop.png"), full_page=True)

    mobile = browser.new_page(viewport={"width": 390, "height": 844})
    attach_diagnostics(mobile)
    response = mobile.goto(url, wait_until="networkidle")
    assert response and response.ok
    mobile_overflow = mobile.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
    assert not mobile_overflow, "mobile page has body-level horizontal overflow"
    assert mobile.locator(".toc").is_visible()
    assert mobile.locator("#choose .decision-list").is_visible()
    mobile.screenshot(path=str(artifact_dir / "time-series-guide-mobile.png"), full_page=True)

    browser.close()

assert not console_errors, f"console errors: {console_errors}"
assert not page_errors, f"page errors: {page_errors}"
assert not failed_requests, f"failed requests: {failed_requests}"
assert not http_errors, f"HTTP errors: {http_errors}"

print(json.dumps({
    "ok": True,
    "tocLinks": 10,
    "methodRows": 11,
    "desktopOverflow": desktop_overflow,
    "mobileOverflow": mobile_overflow,
    "screenshots": [
        str(artifact_dir / "time-series-guide-desktop.png"),
        str(artifact_dir / "time-series-guide-mobile.png"),
    ],
}, ensure_ascii=False))
