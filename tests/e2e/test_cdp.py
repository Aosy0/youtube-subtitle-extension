import asyncio
from browser_use import BrowserSession


async def test_ext():
    # Get current session info
    print("Current URL:", browser.url)
    print("Session type:", type(browser._session))

    # Try to add init script with await
    try:
        # Access the CDP session
        cdp = browser._session.cdp_client
        print("CDP client:", type(cdp))

        # Get page to inject scripts
        page = browser._session.get_current_page()
        print("Page:", type(page))

    except Exception as e:
        print("Error:", e)

    print("Done")


asyncio.run(test_ext())
