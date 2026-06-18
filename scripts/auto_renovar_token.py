import requests, re, os, sys
from datetime import datetime

DASHBOARD_LEADS_DIR = r"C:\Users\User\Documents\OneDrive\Desktop\Dashboard leads"
LOG_FILE = os.path.join(DASHBOARD_LEADS_DIR, 'auto_renovar_token.log')
ENV_FILE = os.path.join(DASHBOARD_LEADS_DIR, '.env')

DASHBOARD_URL  = "http://54.86.238.165"
DASHBOARD_USER = "lucas@o2solution.com.br"
DASHBOARD_PASS = "161299Luv"


def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, 'a', encoding='utf-8') as f:
        f.write(line + "\n")


def main():
    with open(ENV_FILE, 'r') as f:
        conteudo = f.read()

    client_id     = re.search(r'CLIENT_ID\s*=\s*["\']([^"\']+)["\']', conteudo).group(1)
    client_secret = re.search(r'CLIENT_SECRET\s*=\s*["\']([^"\']+)["\']', conteudo).group(1)
    refresh_token = re.search(r'REFRESH_TOKEN\s*=\s*["\']([^"\']+)["\']', conteudo).group(1)

    log("Renovando tokens Followize...")
    resp = requests.post(
        'https://api.followize.com.br/oauth/token',
        data={
            'grant_type':    'refresh_token',
            'refresh_token': refresh_token,
            'client_id':     client_id,
            'client_secret': client_secret,
        },
        timeout=30,
    )

    if resp.status_code != 200:
        log(f"ERRO Followize: HTTP {resp.status_code} — {resp.text}")
        sys.exit(1)

    data = resp.json()
    novo_access  = data['access_token']
    novo_refresh = data['refresh_token']
    log(f"Tokens obtidos (expira em {data['expires_in'] // 3600}h)")

    conteudo = re.sub(r'ACCESS_TOKEN\s*=\s*"[^"]*"',  f'ACCESS_TOKEN  = "{novo_access}"',  conteudo)
    conteudo = re.sub(r'REFRESH_TOKEN\s*=\s*"[^"]*"', f'REFRESH_TOKEN = "{novo_refresh}"', conteudo)
    with open(ENV_FILE, 'w') as f:
        f.write(conteudo)
    log(".env atualizado")

    log("Autenticando no dashboard...")
    login_resp = requests.post(
        f"{DASHBOARD_URL}/api/v1/auth/login",
        json={"email": DASHBOARD_USER, "password": DASHBOARD_PASS},
        timeout=30,
    )
    if login_resp.status_code != 200:
        log(f"ERRO login dashboard: HTTP {login_resp.status_code} — {login_resp.text}")
        sys.exit(1)

    jwt = login_resp.json().get("access_token")
    if not jwt:
        log(f"ERRO: access_token não retornado: {login_resp.text}")
        sys.exit(1)
    log("Login OK")

    log("Enviando tokens para o servidor...")
    push_resp = requests.post(
        f"{DASHBOARD_URL}/api/v1/admin/followize-tokens",
        json={"access_token": novo_access, "refresh_token": novo_refresh},
        headers={"Authorization": f"Bearer {jwt}"},
        timeout=30,
    )
    if push_resp.status_code != 200:
        log(f"ERRO ao enviar tokens: HTTP {push_resp.status_code} — {push_resp.text}")
        sys.exit(1)

    log("Tokens enviados ao servidor com sucesso!")


if __name__ == "__main__":
    main()
