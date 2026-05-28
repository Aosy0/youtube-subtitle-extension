import time

print("Testing extension injection via CDP...")
time.sleep(2)

# Try adding a content script that loads our extension files
ext_path = "C:/Users/koboy/Documents/youtube-subtitle/youtube-subtitle-extension"

scripts = [
    f"""console.log('YSE Extension: Injecting content scripts');""",
    f"""window.yse_test = 'loaded';""",
]

for script in scripts:
    try:
        result = browser._session._cdp_add_init_script(script)
        print(f"Added script: {result}")
    except Exception as e:
        print(f"Error: {e}")

# Check if script was injected
try:
    result = browser._session.evaluate("window.yse_test")
    print(f"yse_test value: {result}")
except Exception as e:
    print(f"Eval error: {e}")

print("Done")
