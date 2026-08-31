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


MODALIDADE_ALIASES: dict[str, str] = {
    "empresarial": "PME",
}


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


ORGANICO_EXTRA = {'site', 'chatgpt.com', 'chatgpt', 'google', 'instagram', 'facebook', 'whatsapp'}


def is_organico(origin: str | None, conversion_point: str | None = None) -> bool:
    if (conversion_point or '').strip().lower() == 'chatgpt.com':
        return True
    o = (origin or '').lower()
    return 'org' in o or o in ORGANICO_EXTRA
