from fastapi import Request


def client_ip(request: Request) -> str:
    """IP real de quem fez a requisição. A cadeia é cliente → Caddy → nginx →
    uvicorn, então `request.client.host` é o container do nginx. O nginx repassa
    o X-Forwarded-For (primeiro valor = cliente original)."""
    cf = (request.headers.get("cf-connecting-ip") or "").strip()
    if cf:
        return cf
    xff = request.headers.get("x-forwarded-for") or ""
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    real = (request.headers.get("x-real-ip") or "").strip()
    if real:
        return real
    return request.client.host if request.client else "desconhecido"


def ua_short(ua: str | None) -> str:
    """Resumo do user-agent pra rotular um dispositivo (ex.: 'Chrome · Windows')."""
    ua = ua or ""
    so = ("Windows" if "Windows" in ua else "Mac" if ("Mac OS X" in ua or "Macintosh" in ua)
          else "Android" if "Android" in ua else "iOS" if ("iPhone" in ua or "iPad" in ua)
          else "Linux" if "Linux" in ua else "")
    br = ("Edge" if "Edg/" in ua else "Opera" if ("OPR/" in ua or "Opera" in ua)
          else "Chrome" if "Chrome/" in ua else "Firefox" if "Firefox/" in ua
          else "Safari" if "Safari/" in ua else "")
    return " · ".join(p for p in (br, so) if p) or "dispositivo"
