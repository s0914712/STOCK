from playwright.sync_api import sync_playwright


def main():
    console_errors = []
    page_errors = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.on("console", lambda message: console_errors.append(message.text)
                if message.type == "error" else None)
        page.on("pageerror", lambda error: page_errors.append(str(error)))

        page.goto("http://127.0.0.1:3000", wait_until="networkidle")
        page.locator("#official-input").fill("2330")
        page.locator("#official-btn").click()
        page.locator("#official-result .official-grid").wait_for(timeout=30_000)

        result = page.locator("#official-result").inner_text()
        print(result)
        assert "台積電" in result
        assert "2395.00" in result
        assert "27.76" in result
        assert "44.7%" in result
        assert "資料日 2026-08-14" in result
        assert not page_errors, f"page errors: {page_errors}"

        # External chart CDNs are optional; only fail on first-party browser errors.
        first_party_errors = [
            message for message in console_errors
            if "127.0.0.1:3000" in message or "TypeError" in message or "ReferenceError" in message
        ]
        assert not first_party_errors, f"console errors: {first_party_errors}"
        print("webapp OpenAPI smoke test passed")
        browser.close()


if __name__ == "__main__":
    main()
