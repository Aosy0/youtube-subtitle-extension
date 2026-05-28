import asyncio


async def main():
    # Get the current page context
    page = browser._session.get_current_page()
    print("Page object:", type(page))

    # Try to evaluate JavaScript in page context
    try:
        # Use the page's evaluate method
        result = await page.evaluate("() => 'test result'")
        print("Eval result:", result)
    except Exception as e:
        print("Error:", e)

    print("Done")


asyncio.run(main())
