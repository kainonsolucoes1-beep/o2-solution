import re

BASE_ALIASES: dict[str, str] = {
    "empresas até 9 colaboradores":                    "Empresas SP capital LTDA - Até 9 colaboradores",
    "discadora – empresas sp até 9 colaboradores":     "Empresas SP capital LTDA - Até 9 colaboradores",
    "discadora - empresas sp até 9 colaboradores":     "Empresas SP capital LTDA - Até 9 colaboradores",
    "empresas sp até 9 colaboradores":                 "Empresas SP capital LTDA - Até 9 colaboradores",
    "empresas sp — até 9 colaboradores":               "Empresas SP capital LTDA - Até 9 colaboradores",
    "empresas sp - até 9 colaboradores":               "Empresas SP capital LTDA - Até 9 colaboradores",
    "não informado":                                   "Empresas SP capital LTDA - Até 9 colaboradores",
    "empresas em sp ltda - ate 9 colaboradores":       "Empresas SP capital LTDA - Até 9 colaboradores",
    "ate 9 colaboradores":                             "Empresas SP capital LTDA - Até 9 colaboradores",
    "mei sp (discadora)":                              "Clientes MEI em SP",
    "clientes mei em sp":                              "Clientes MEI em SP",
    "mei em sp":                                        "Clientes MEI em SP",
    "discadora sul américa":                           "SulAmerica",
    "discadora sul america":                           "SulAmerica",
    "base sulamerica":                                 "SulAmerica",
    # Amil - nível Brasil / nacional (mesma base, grafias variadas)
    "amil clientes nível brasil parte 2":              "Base Amil",
    "amil clientes nível brasil":                      "Base Amil",
    "amil clientes nivel brasil":                      "Base Amil",
    "amil clintes nível brasil":                       "Base Amil",
    "amil nacional":                                   "Base Amil",
    "amil nivel nacional":                             "Base Amil",
    "amil nível brasil":                               "Base Amil",
    "amil nivel brasil":                               "Base Amil",
    "amil nível brasil 2":                             "Base Amil",
    "amil nível brasil parte 2":                       "Base Amil",
    "amil base nível brasil":                          "Base Amil",
    "base amil":                                       "Base Amil",
    "base amil nacional":                              "Base Amil",
    "base amil nível brasil":                          "Base Amil",
    "base_base_amil_nacional":                         "Base Amil",
    "base_amil_clientes_nível_brasil":                 "Base Amil",
    "base_amil_clientes_nível_brasil_dda_discadora":   "Base Amil",
    # Até 9 colaboradores (partes/grafias variadas)
    "até 9 colaboradores":                             "Empresas SP capital LTDA - Até 9 colaboradores",
    "até 9 colaboradores parte":                       "Empresas SP capital LTDA - Até 9 colaboradores",
    "até 9 colaboradores parte 1":                     "Empresas SP capital LTDA - Até 9 colaboradores",
    "até 9 colaboradores parte 2":                     "Empresas SP capital LTDA - Até 9 colaboradores",
    "até 9 colaboradores parte 9":                     "Empresas SP capital LTDA - Até 9 colaboradores",
    "9 colaboradores parte 1":                         "Empresas SP capital LTDA - Até 9 colaboradores",
    "base_9_colaboradores":                            "Empresas SP capital LTDA - Até 9 colaboradores",
    "base_9_colaboradores_parte_1":                    "Empresas SP capital LTDA - Até 9 colaboradores",
    "base_até 9 colaboradores parte 1":                "Empresas SP capital LTDA - Até 9 colaboradores",
    "base_até_9_colaboradores_parte_1":                "Empresas SP capital LTDA - Até 9 colaboradores",
    "base_até9colaboradoresparte11":                   "Empresas SP capital LTDA - Até 9 colaboradores",
    "base_até_nove_colaboradores parte 2":             "Empresas SP capital LTDA - Até 9 colaboradores",
    "base_empresas_ddd11":                             "Empresas SP capital LTDA - Até 9 colaboradores",
    # SulAmerica (grafias variadas)
    "sulamerica":                                      "SulAmerica",
    "sulamerica filtrada":                             "SulAmerica",
    "base_sulamerica":                                 "SulAmerica",
    # Bradesco
    "base_bradesco":                                   "Base Bradesco",
    # São Paulo, Campinas e Jundiaí (grafias variadas)
    "base_skill_padrao_lote_sao_paulo_campinas_e_jundiai_novas_empresas": "São Paulo, Campinas e Jundiaí",
    "sp, campinas, jundiai novas empresas parte 2":    "São Paulo, Campinas e Jundiaí",
    "sp, campinas e jundiai nova empresas":            "São Paulo, Campinas e Jundiaí",
    "sao paulo, campinas e jundiai":                   "São Paulo, Campinas e Jundiaí",
    # Indicação
    "cliente indicação":                              "Indicação",
    "indicação (cliente que entrou em contato)":      "Indicação",
}
_BASE_RE_EMOJI  = re.compile(r'🗂️\s*Base:\s*([^|\n]+)')
_BASE_RE_SIMPLE = re.compile(r'(?im)^Base:\s*([^\n]+)')
# remove sufixo de data (ex: "- 23/07", "– 23/07/2026") que algumas cargas
# anexam ao nome da base, senao cada dia vira um grupo separado na listagem.
_BASE_DATE_SUFFIX_RE = re.compile(r'\s*[-–]\s*\d{1,2}/\d{1,2}(?:/\d{2,4})?\s*$')


def extract_base(notes: str | None) -> str | None:
    text = notes or ''
    m = _BASE_RE_EMOJI.search(text) or _BASE_RE_SIMPLE.search(text)
    if not m:
        return None
    base = m.group(1).strip()
    if not base:
        return None
    base = _BASE_DATE_SUFFIX_RE.sub('', base).strip() or base
    return BASE_ALIASES.get(base.lower(), base)


# Formulários de Lead Ads da Meta: id do formulário -> nome que aparece no
# "Ponto de conversão". Formulário novo: incluir aqui (sem isso o lead entra
# com o número do formulário).
META_FORMULARIOS: dict[str, str] = {
    "920887077776708": "Meta Alice - SP",
    "2154020872683921": "Meta SulAmerica - BH",
    "1873422073618444": "Meta Amil - SP",
}


def parse_vidas(raw) -> int | None:
    """Quantidade de vidas digitada/respondida ("3", "3 vidas", "Somente eu")
    -> inteiro; sem número (ou fora de 1..999) fica vazio."""
    if raw is None:
        return None
    if isinstance(raw, int):
        return raw if 0 < raw < 1000 else None
    texto = str(raw).strip().lower()
    if texto in ("só eu", "so eu", "somente eu", "apenas eu", "eu", "individual"):
        return 1
    m = re.search(r"\d+", texto)
    if not m:
        return None
    n = int(m.group())
    return n if 0 < n < 1000 else None


def parse_idades(raw) -> str | None:
    """Idades em texto livre ("35 anos, 32 e 5") -> "35,32,5" (formato do
    ages_raw, que alimenta o gráfico de idade do titular)."""
    if raw is None:
        return None
    nums = [n for n in re.findall(r"\d+", str(raw)) if 0 <= int(n) <= 120]
    return ",".join(nums)[:100] or None


MODALIDADE_ALIASES: dict[str, str] = {
    "empresarial": "PME",
}


# Ponto de conversao e' texto livre (URL, nome de campanha digitado a mao), entao
# so' normalizamos os poucos rotulos conhecidos que geram grafia inconsistente --
# nao mexe em dominios/URLs, que ja' chegam padronizados.
CONVERSION_POINT_ALIASES: dict[str, str] = {
    "campanha whatsapp": "Campanhas WhatsApp",
    "campanhas whatsapp": "Campanhas WhatsApp",
}


def normalize_conversion_point(raw: str | None) -> str:
    nome = (raw or "").strip() or "Não informado"
    return CONVERSION_POINT_ALIASES.get(nome.lower(), nome)


def normalize_modalidade(raw: str | None) -> str:
    nome = (raw or "").strip() or "Não informado"
    return MODALIDADE_ALIASES.get(nome.lower(), nome)


def modalidade_raw_variants(canonical: str) -> set[str]:
    """Valores brutos (lowercase) que devem contar como `canonical` -- o
    proprio nome canonico mais qualquer alias que aponte pra ele."""
    target = canonical.strip().lower()
    variants = {target}
    variants |= {raw for raw, alias in MODALIDADE_ALIASES.items() if alias.lower() == target}
    return variants


ORGANICO_EXTRA = {'site', 'chatgpt.com', 'chatgpt', 'google', 'instagram', 'facebook', 'whatsapp', 'meta ads'}


def is_organico(origin: str | None, conversion_point: str | None = None) -> bool:
    if (conversion_point or '').strip().lower() == 'chatgpt.com':
        return True
    o = (origin or '').strip().lower()
    # "Site - Porto Saúde Linha Bairro" etc.: formulário de site é orgânico
    return 'org' in o or o in ORGANICO_EXTRA or o.startswith('site')


# Google tem grupo próprio nas contagens (SDR / Orgânico / Google), mas
# continua fora de SDR: is_organico segue True pra ele (visibilidade do
# comercial, ranking de operadores etc. tratam "não é SDR" do mesmo jeito).
GOOGLE_ORIGENS = {'google'}


def is_google(origin: str | None) -> bool:
    return (origin or '').strip().lower() in GOOGLE_ORIGENS


# Sinonimos de "nao tenho plano de saude" usados em diferentes formularios
# (site publico e formulario de lead ads do Meta) que devem cair no mesmo
# sentinela usado pelos KPIs.
SEM_PLANO = {
    "não possui plano", "nao possui plano", "não possuo plano", "nao possuo plano",
    "sem plano", "não tenho plano", "nao tenho plano", "nenhum", "não", "nao",
    "não tenho plano de saúde", "nao tenho plano de saude",
}


def normalize_current_plan(current_plan):
    if not current_plan or not current_plan.strip():
        return None
    if current_plan.strip().lower() in SEM_PLANO:
        return "Não possui plano"
    return current_plan.strip()


# ── Perfil do lead: vidas e faixa etária (filtros do Relatório de Leads) ──────
# Junta as três fontes que existem hoje: o campo vidas, o campo ages_raw
# ("33,32,89") e as observações dos leads do site ("24-28 anos: 2 pessoa(s)",
# "Idade: 38", "Vidas: 3"). Faixas = as 10 da ANS.
FAIXAS_ANS = [
    (0, 18, "0-18"), (19, 23, "19-23"), (24, 28, "24-28"), (29, 33, "29-33"),
    (34, 38, "34-38"), (39, 43, "39-43"), (44, 48, "44-48"), (49, 53, "49-53"),
    (54, 58, "54-58"), (59, 999, "59+"),
]
VIDAS_BUCKETS = ["1", "2", "3-4", "5-9", "10+"]

_FAIXA_NOTA_RE = re.compile(r'(\d{1,2})\s*[-–]\s*(\d{1,2})\s*anos?\s*:\s*(\d+)|59\s*\+\s*anos?\s*:\s*(\d+)', re.I)
_IDADE_NOTA_RE = re.compile(r'\bIdades?\s*:?\**\s*(\d[^|\n]{0,80})', re.I)
_VIDAS_NOTA_RE = re.compile(r'\bvidas?\s*:\s*([^\n|]{0,20})', re.I)


def faixa_ans(idade: int) -> str:
    for lo, hi, label in FAIXAS_ANS:
        if lo <= idade <= hi:
            return label
    return "59+"


def _idades_de(raw: str) -> list:
    out = []
    for part in re.split(r',|;|\be\b|/', raw):
        part = part.strip().lower()
        if not part:
            continue
        if re.fullmatch(r'\d{1,2}\s*m(eses?)?', part):  # bebê em meses
            out.append(0)
            continue
        for n in re.findall(r'\d+', part):
            if int(n) <= 110:
                out.append(int(n))
    return out


def perfil_lead(vidas, ages_raw, notes):
    """(vidas, idades, faixas) do lead. vidas: int ou None; idades: lista de
    idades conhecidas; faixas: dict faixa -> pessoas."""
    notes = notes or ""
    idades = _idades_de(ages_raw) if ages_raw and ages_raw.strip() else []
    if not idades:
        m = _IDADE_NOTA_RE.search(notes)
        if m:
            idades = _idades_de(m.group(1))

    faixas: dict = {}
    for a in idades:
        faixas[faixa_ans(a)] = faixas.get(faixa_ans(a), 0) + 1
    if not idades:
        for lo, hi, n1, n2 in _FAIXA_NOTA_RE.findall(notes):
            label = f"{int(lo)}-{int(hi)}" if lo else "59+"
            if label not in {f[2] for f in FAIXAS_ANS}:
                continue
            n = int(n1 or n2 or 0)
            if n <= 0:
                continue
            # tem formulário em que a pessoa digitou a idade no lugar da
            # quantidade ("59+ anos: 62") -- conta como 1 pessoa
            faixas[label] = faixas.get(label, 0) + (1 if n >= 10 else n)

    v = vidas if vidas else None
    if v is None and faixas:
        v = sum(faixas.values())
    if v is None:
        m = _VIDAS_NOTA_RE.search(notes)
        if m and re.fullmatch(r'\d{1,3}', m.group(1).strip()):
            v = int(m.group(1).strip()) or None
    return v, idades, faixas


def vidas_bucket(v) -> str:
    if not v:
        return "sem"
    if v <= 2:
        return str(v)
    if v <= 4:
        return "3-4"
    if v <= 9:
        return "5-9"
    return "10+"


def idades_resumo(idades: list, faixas: dict):
    """Texto pra planilha/lista: idades exatas se houver, senão as faixas."""
    if idades:
        return ", ".join(str(a) for a in idades)
    if faixas:
        ordem = [f[2] for f in FAIXAS_ANS]
        return ", ".join(
            f"{k} anos" + (f" ({faixas[k]})" if faixas[k] > 1 else "")
            for k in sorted(faixas, key=ordem.index)
        )
    return None
