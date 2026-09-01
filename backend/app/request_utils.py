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
