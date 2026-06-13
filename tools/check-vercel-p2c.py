#!/usr/bin/env python3
import re
import sys
import time
import urllib.request

URL = sys.argv[1] if len(sys.argv) > 1 else "https://cia-alpha44.vercel.app/"


def check() -> bool:
    html = urllib.request.urlopen(URL, timeout=30).read().decode("utf-8", "replace")
    scripts = re.findall(r'src="([^"]+\.js)"', html)
    if not scripts:
        return False
    jsurl = scripts[0] if scripts[0].startswith("http") else URL.rstrip("/") + scripts[0]
    js = urllib.request.urlopen(jsurl, timeout=60).read().decode("utf-8", "replace")
    print(f"bundle: {jsurl}")
    ok = "moedaPlanilha" in js and "EUR tratados" in js
    print(f"moedaPlanilha: {'OK' if 'moedaPlanilha' in js else 'MISSING'}")
    print(f"aviso EUR: {'OK' if 'EUR tratados' in js else 'MISSING'}")
    return ok


if __name__ == "__main__":
    for i in range(8):
        print(f"\n--- tentativa {i + 1} ---")
        try:
            if check():
                print("\nVercel P2c: DEPLOY OK")
                sys.exit(0)
        except Exception as e:
            print(f"erro: {e}")
        time.sleep(20)
    print("\nVercel P2c: aguardando deploy ou bundle ainda antigo")
    sys.exit(1)
