import { useState, type ReactNode } from 'react'
import { Copy, Check, ExternalLink, Link2 } from 'lucide-react'

// Documentação da API pública dentro do o2sig (Configurações > API >
// Documentação). Espelha a página estática pra integradores
// (frontend/public/integracao/index.html) -- ao mudar campo/regra da API,
// atualizar as duas. Aqui dentro, os exemplos podem ser copiados com as
// chaves reais (a página pública nunca mostra chave).

interface Props {
  accountKey: string | null
  teamKeys: Record<string, { name: string; value: string }>
}

const PUBLIC_DOC_PATH = '/integracao/'

const TOC: { group: string; items: { id: string; label: string; method?: 'GET' | 'POST' }[] }[] = [
  { group: 'Começo', items: [
    { id: 'visao-geral', label: 'Visão geral' },
    { id: 'url-base', label: 'URL base' },
    { id: 'autenticacao', label: 'Autenticação' },
  ] },
  { group: 'Endpoints', items: [
    { id: 'ping', label: '/ping', method: 'GET' },
    { id: 'criar-lead', label: '/leads', method: 'POST' },
    { id: 'consultar-lead', label: '/leads/{id}', method: 'GET' },
  ] },
  { group: 'Referência', items: [
    { id: 'campos', label: 'Campos do lead' },
    { id: 'meta-ads', label: 'Mapeamento Meta Ads' },
    { id: 'respostas', label: 'Respostas e erros' },
    { id: 'limites', label: 'Limites e duplicidade' },
    { id: 'homologacao', label: 'Homologação' },
  ] },
]

const KEY_CONTA = 'SUA_CHAVE_DA_CONTA'
const KEY_EQUIPE = 'SUA_CHAVE_DA_EQUIPE'
const LEAD_ID_EX = '3f2c9a1e-7b4d-4c1a-9e2f-6a8b0c1d2e3f'

const STATUS_ROWS: [ReactNode, string, string][] = [
  [<><C>novo</C></>, 'Novo', 'Recebido, ainda sem contato'],
  [<><C>qualificado</C> / <C>scheduled</C></>, 'Agendado', 'Em atendimento'],
  [<><C>aguardando_dados</C></>, 'Aguardando dados', 'Em atendimento'],
  [<><C>sem_retorno</C></>, 'Sem retorno', 'Em atendimento'],
  [<><C>proposta</C> / <C>proposal_sent</C></>, 'Proposta / Proposta enviada', 'Proposta'],
  [<><C>negociacao</C></>, 'Em negociação', 'Proposta'],
  [<><C>pendencia</C> / <C>documentacao_pendente</C></>, 'Pendência / Documentação pendente', 'Fechamento'],
  [<><C>emissao</C></>, 'Emissão', 'Fechamento'],
  [<><C>waiting_billing</C></>, 'Aguardando faturamento', 'Venda'],
  [<><C>sale_performed</C></>, 'Venda realizada', 'Venda'],
  [<><C>sale_not_performed</C></>, 'Cancelado', 'Perdido'],
]

function C({ children }: { children: ReactNode }) {
  return <code className="apidoc-ic">{children}</code>
}

function Method({ m }: { m: 'GET' | 'POST' }) {
  return <span className={`apidoc-method ${m === 'GET' ? 'get' : 'post'}`}>{m}</span>
}

// Realce simples: "string" seguida de ":" é chave; outras strings em verde;
// comentários (// ou #) em cinza; palavras-chave da linguagem em azul.
const KEYWORDS = new Set(['const', 'await', 'if', 'else', 'import', 'elif', 'pass'])
function highlight(code: string): ReactNode[] {
  const out: ReactNode[] = []
  // comentário só depois de espaço, senão o "//" de https:// viraria comentário
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|((?<=\s)(?:\/\/|#)[^\n]*)|\b([a-z]+)\b/g
  let last = 0, m: RegExpExecArray | null, i = 0
  while ((m = re.exec(code))) {
    if (m[4] && !KEYWORDS.has(m[4])) continue
    if (m.index > last) out.push(code.slice(last, m.index))
    if (m[1]) {
      out.push(<span key={i++} className={m[2] ? 'k' : 's'}>{m[1]}</span>)
      if (m[2]) out.push(m[2])
    } else if (m[3]) {
      out.push(<span key={i++} className="c">{m[3]}</span>)
    } else {
      out.push(<span key={i++} className="k">{m[4]}</span>)
    }
    last = re.lastIndex
  }
  if (last < code.length) out.push(code.slice(last))
  return out
}

function CodeBlock({ title, code, withKeys }: { title: string; code: string; withKeys?: (c: string) => string | null }) {
  const [copied, setCopied] = useState<'' | 'plain' | 'keys'>('')
  const real = withKeys ? withKeys(code) : null
  function copy(kind: 'plain' | 'keys', text: string) {
    navigator.clipboard.writeText(text).then(() => { setCopied(kind); setTimeout(() => setCopied(''), 1600) }).catch(() => {})
  }
  return (
    <div className="apidoc-code">
      <div className="apidoc-code-head">
        <span>{title}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {real && (
            <button className="apidoc-copy" onClick={() => copy('keys', real)} title="Copia o comando já com as chaves reais desta conta">
              {copied === 'keys' ? <><Check size={12} /> Copiado</> : <>Copiar com minhas chaves</>}
            </button>
          )}
          <button className="apidoc-copy" onClick={() => copy('plain', code)}>
            {copied === 'plain' ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}
          </button>
        </div>
      </div>
      <pre>{highlight(code)}</pre>
    </div>
  )
}

function Endpoint({ m, path, children }: { m: 'GET' | 'POST'; path: string; children: ReactNode }) {
  return (
    <div className="apidoc-endpoint">
      <div className="apidoc-endpoint-head"><Method m={m} /><span className="apidoc-path">{path}</span></div>
      <div className="apidoc-endpoint-body">{children}</div>
    </div>
  )
}

function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="apidoc-table">
      <table>
        <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function Req() { return <span className="apidoc-req">obrigatório</span> }
function Opt({ children = 'opcional' }: { children?: string }) { return <span className="apidoc-opt">{children}</span> }

export default function ApiDocsTab({ accountKey, teamKeys }: Props) {
  const origin = import.meta.env.VITE_API_URL || window.location.origin
  const base = `${origin}/api/v1/public`
  const publicDocUrl = `${origin}${PUBLIC_DOC_PATH}`
  const [lang, setLang] = useState<'curl' | 'node' | 'py'>('curl')
  const [teamSlug, setTeamSlug] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [baseCopied, setBaseCopied] = useState(false)
  const slugs = Object.keys(teamKeys)
  const activeSlug = teamSlug ?? slugs[0] ?? null
  const teamValue = activeSlug ? teamKeys[activeSlug]?.value ?? null : null

  // troca os marcadores pelas chaves reais; null quando faltar alguma
  const withKeys = (code: string) =>
    accountKey && teamValue ? code.split(KEY_CONTA).join(accountKey).split(KEY_EQUIPE).join(teamValue) : null

  function goTo(id: string) {
    document.getElementById(`apidoc-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const curlPing = `curl ${base}/ping \\
  -H "X-API-Key: ${KEY_CONTA}" \\
  -H "X-Team-Key: ${KEY_EQUIPE}"`

  const curlPost = `curl -X POST ${base}/leads \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${KEY_CONTA}" \\
  -H "X-Team-Key: ${KEY_EQUIPE}" \\
  -d '{
    "name": "Maria da Silva",
    "phone": "11987654321",
    "email": "maria@exemplo.com",
    "origin": "Meta Ads",
    "campanha": "Meta",
    "conversion_point": "Formulário Amil PF - Outubro",
    "modalidade": "PF",
    "current_plan": "Não possui plano",
    "faixa_29_33": 1,
    "faixa_0_18": 2,
    "message": "Prefere contato à tarde",
    "utm_source": "facebook",
    "utm_medium": "paid_social",
    "utm_campaign": "amil-pf-outubro",
    "utm_content": "video-15s",
    "fbclid": "IwAR2xYz..."
  }'`

  const nodePost = `const resp = await fetch("${base}/leads", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": process.env.O2SIG_API_KEY,
    "X-Team-Key": process.env.O2SIG_TEAM_KEY,
  },
  body: JSON.stringify({
    name: "Maria da Silva",
    phone: "11987654321",
    email: "maria@exemplo.com",
    origin: "Meta Ads",
    campanha: "Meta",
    conversion_point: "Formulário Amil PF - Outubro",
    utm_campaign: "amil-pf-outubro",
  }),
  signal: AbortSignal.timeout(15000),
});

if (resp.status === 201) {
  const { lead_id } = await resp.json();   // guarde para consultar depois
} else if (resp.status === 409) {
  // lead já existe no o2sig: não reenviar
} else {
  // 4xx: corrigir o envio · 429/5xx: tentar de novo mais tarde
}`

  const pyPost = `import os, requests

resp = requests.post(
    "${base}/leads",
    headers={
        "X-API-Key": os.environ["O2SIG_API_KEY"],
        "X-Team-Key": os.environ["O2SIG_TEAM_KEY"],
    },
    json={
        "name": "Maria da Silva",
        "phone": "11987654321",
        "email": "maria@exemplo.com",
        "origin": "Meta Ads",
        "campanha": "Meta",
        "conversion_point": "Formulário Amil PF - Outubro",
    },
    timeout=15,
)
if resp.status_code == 201:
    lead_id = resp.json()["lead_id"]
elif resp.status_code == 409:
    pass  # lead já existe: não reenviar`

  const curlGet = `curl ${base}/leads/${LEAD_ID_EX} \\
  -H "X-API-Key: ${KEY_CONTA}" \\
  -H "X-Team-Key: ${KEY_EQUIPE}"`

  return (
    <div className="apidoc">
      <style>{APIDOC_CSS}</style>

      <nav className="apidoc-toc" aria-label="Sumário">
        {TOC.map(g => (
          <div key={g.group}>
            <p>{g.group}</p>
            {g.items.map(it => (
              <button key={it.id} onClick={() => goTo(it.id)}>
                {it.method && <Method m={it.method} />}{it.label}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="apidoc-main">
        <header className="apidoc-hero">
          <p className="apidoc-eyebrow">O2 Solution · Documentação de integração</p>
          <h1>API de Leads do o2sig</h1>
          <p className="apidoc-lead">Como enviar leads de campanhas (Meta Ads, formulários, automações) direto para o CRM o2sig e consultar o andamento de cada lead enviado.</p>
          <div className="apidoc-meta"><span>Versão v1</span><span>Formato JSON · UTF-8</span><span>Somente HTTPS</span></div>
        </header>

        <div className="apidoc-share">
          <Link2 size={16} style={{ flexShrink: 0, color: 'var(--accent)' }} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <strong>Link para enviar a quem vai integrar</strong>
            <span>Mesma documentação, sem nenhuma chave. As chaves vão por outro canal.</span>
          </div>
          <button className="apidoc-btn" onClick={() => navigator.clipboard.writeText(publicDocUrl).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1600) }).catch(() => {})}>
            {linkCopied ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar link</>}
          </button>
          <a className="apidoc-btn" href={PUBLIC_DOC_PATH} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Abrir</a>
        </div>

        {slugs.length > 0 && (
          <div className="apidoc-keys">
            <span>Chaves usadas em “Copiar com minhas chaves”:</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {slugs.map(slug => (
                <button key={slug} className="apidoc-tab" aria-selected={activeSlug === slug} onClick={() => setTeamSlug(slug)}>
                  {teamKeys[slug].name}
                </button>
              ))}
            </div>
          </div>
        )}

        <section id="apidoc-visao-geral">
          <h2>Visão geral</h2>
          <p>A API pública do o2sig recebe leads de sistemas externos. Cada lead enviado entra no CRM com status <strong>Novo</strong>, é distribuído automaticamente para um atendente da equipe (rodízio) e o atendente é avisado na hora.</p>
          <Table head={['Método', 'Caminho', 'Para que serve']}>
            <tr><td><Method m="GET" /></td><td><C>/ping</C></td><td>Testar as chaves de acesso, sem criar nada.</td></tr>
            <tr><td><Method m="POST" /></td><td><C>/leads</C></td><td>Cadastrar um lead novo.</td></tr>
            <tr><td><Method m="GET" /></td><td><C>/leads/{'{lead_id}'}</C></td><td>Consultar o status de um lead enviado por você.</td></tr>
          </Table>
        </section>

        <section id="apidoc-url-base">
          <h2>URL base</h2>
          <p>Todos os caminhos desta página são relativos a esta URL:</p>
          <div className="apidoc-baseurl">
            <span className="label">Base</span>
            <code>{base}</code>
            <button className="apidoc-btn" onClick={() => navigator.clipboard.writeText(base).then(() => { setBaseCopied(true); setTimeout(() => setBaseCopied(false), 1600) }).catch(() => {})}>
              {baseCopied ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
            </button>
          </div>
          <p>Para cadastrar leads, o endereço completo é <C>{base}/leads</C> (método <strong>POST</strong>).</p>
        </section>

        <section id="apidoc-autenticacao">
          <h2>Autenticação</h2>
          <p>Toda requisição precisa de dois cabeçalhos. As chaves ficam na aba <strong>Chaves</strong> desta tela e são enviadas ao integrador por um canal separado.</p>
          <Table head={['Cabeçalho', 'Valor']}>
            <tr><td><C>X-API-Key</C></td><td>Chave da conta O2 Solution.</td></tr>
            <tr><td><C>X-Team-Key</C></td><td>Chave da equipe que vai receber os leads. Define para qual equipe e para qual rodízio de atendentes o lead vai.</td></tr>
            <tr><td><C>Content-Type</C></td><td><C>application/json</C> (no POST).</td></tr>
          </Table>
          <div className="apidoc-callout warn"><strong>Use as chaves só no servidor.</strong> Não coloque as chaves em código que roda no navegador, em pixel, em tag do Google Tag Manager ou em formulário público: quem vê o código-fonte da página passaria a ter acesso à API.</div>
        </section>

        <section id="apidoc-ping">
          <h2>Testar credenciais</h2>
          <Endpoint m="GET" path="/ping">
            <p>Confere se as duas chaves estão corretas e qual equipe elas representam. Não cria nem altera nada; use para validar a configuração antes de ligar a integração.</p>
            <CodeBlock title="Requisição · cURL" code={curlPing} withKeys={withKeys} />
            <CodeBlock title="Resposta · 200 OK" code={`{\n  "success": true,\n  "equipe": "Equipe São Paulo"\n}`} />
          </Endpoint>
        </section>

        <section id="apidoc-criar-lead">
          <h2>Cadastrar lead</h2>
          <Endpoint m="POST" path="/leads">
            <p>Cria um lead no o2sig. Obrigatórios: <C>name</C> e <C>phone</C>. Todos os campos estão em <a href="#apidoc-campos" onClick={e => { e.preventDefault(); goTo('campos') }}>Campos do lead</a>.</p>
            <div className="apidoc-tabs" role="tablist" aria-label="Linguagem do exemplo">
              {([['curl', 'cURL'], ['node', 'JavaScript (Node)'], ['py', 'Python']] as const).map(([id, label]) => (
                <button key={id} role="tab" className="apidoc-tab" aria-selected={lang === id} onClick={() => setLang(id)}>{label}</button>
              ))}
            </div>
            {lang === 'curl' && <CodeBlock title="Requisição · cURL" code={curlPost} withKeys={withKeys} />}
            {lang === 'node' && <CodeBlock title="Requisição · Node 18+" code={nodePost} />}
            {lang === 'py' && <CodeBlock title="Requisição · Python (requests)" code={pyPost} />}
            <CodeBlock title="Resposta · 201 Created" code={`{\n  "success": true,\n  "lead_id": "${LEAD_ID_EX}"\n}`} />
          </Endpoint>
        </section>

        <section id="apidoc-consultar-lead">
          <h2>Consultar lead</h2>
          <Endpoint m="GET" path="/leads/{lead_id}">
            <p>Devolve o status atual de um lead, usando o <C>lead_id</C> recebido no cadastro. Só enxerga leads da equipe da chave e traz apenas dados de acompanhamento; os dados internos da ficha não são expostos.</p>
            <CodeBlock title="Requisição · cURL" code={curlGet} withKeys={withKeys} />
            <CodeBlock title="Resposta · 200 OK" code={`{
  "lead_id": "${LEAD_ID_EX}",
  "name": "Maria da Silva",
  "status": "proposal_sent",
  "status_label": "Proposta enviada",
  "origin": "Meta Ads",
  "campanha": "Meta",
  "equipe": "Equipe São Paulo",
  "created_at": "2026-11-03T14:22:05Z"
}`} />
            <h3>Status possíveis</h3>
            <Table head={[<C key="s">status</C>, <C key="l">status_label</C>, 'Etapa']}>
              {STATUS_ROWS.map(([s, l, e], i) => <tr key={i}><td>{s}</td><td>{l}</td><td>{e}</td></tr>)}
            </Table>
            <p>Trate valores desconhecidos de <C>status</C> de forma genérica e exiba o <C>status_label</C>: novos status podem ser criados no CRM.</p>
          </Endpoint>
        </section>

        <section id="apidoc-campos">
          <h2>Campos do lead</h2>
          <p>Corpo JSON do <C>POST /leads</C>. Campos fora desta lista são ignorados. Texto em UTF-8, com acentos normalmente.</p>
          <h3>Contato</h3>
          <Table head={['Campo', 'Tipo', 'Descrição']}>
            <tr><td><C>name</C><Req /></td><td className="type">string</td><td>Nome completo.</td></tr>
            <tr><td><C>phone</C><Req /></td><td className="type">string</td><td>Celular com DDD. Prefira só dígitos: <C>11987654321</C>. Sem <C>+55</C> é o formato recomendado.</td></tr>
            <tr><td><C>email</C><Opt /></td><td className="type">string</td><td>E-mail. Usado também para evitar lead duplicado.</td></tr>
            <tr><td><C>company</C><Opt /></td><td className="type">string</td><td>Empresa (planos PME).</td></tr>
            <tr><td><C>message</C><Opt /></td><td className="type">string</td><td>Texto livre do lead. Aparece na linha do tempo da ficha. Respostas de perguntas personalizadas podem vir aqui, uma por linha, no formato “Pergunta: resposta”.</td></tr>
          </Table>
          <h3>Origem e campanha</h3>
          <Table head={['Campo', 'Tipo', 'Descrição']}>
            <tr><td><C>origin</C><Opt>recomendado</Opt></td><td className="type">string</td><td>Canal de origem. <strong>Para Meta Ads envie <C>"Meta Ads"</C>.</strong> Se omitido, o lead entra como <C>"Orgânico"</C> e fica fora das métricas da campanha.</td></tr>
            <tr><td><C>campanha</C><Opt>recomendado</Opt></td><td className="type">string</td><td>Campo “Campanha” da ficha. Use <C>"Meta"</C> para Meta Ads ou <C>"Google"</C> para Google Ads. Máx. 50 caracteres.</td></tr>
            <tr><td><C>conversion_point</C><Opt>recomendado</Opt></td><td className="type">string</td><td>Ponto de conversão: nome do formulário, da landing page ou do anúncio. Vira filtro nos relatórios do CRM.</td></tr>
            <tr><td><C>utm_source</C><Opt /></td><td className="type">string</td><td>Aceito sem erro, mas não é gravado: o canal oficial é o <C>origin</C>.</td></tr>
            <tr><td><C>utm_medium</C><Opt /></td><td className="type">string</td><td>Mídia (ex.: <C>paid_social</C>).</td></tr>
            <tr><td><C>utm_campaign</C><Opt /></td><td className="type">string</td><td>Nome ou ID da campanha.</td></tr>
            <tr><td><C>utm_term</C><Opt /></td><td className="type">string</td><td>Conjunto de anúncios / público.</td></tr>
            <tr><td><C>utm_content</C><Opt /></td><td className="type">string</td><td>Criativo / anúncio.</td></tr>
            <tr><td><C>fbclid</C><Opt /></td><td className="type">string</td><td>Identificador do clique no Meta, quando houver.</td></tr>
            <tr><td><C>gclid</C><Opt /></td><td className="type">string</td><td>Identificador do clique no Google Ads, quando houver.</td></tr>
          </Table>
          <h3>Perfil do plano</h3>
          <Table head={['Campo', 'Tipo', 'Descrição']}>
            <tr><td><C>modalidade</C><Opt /></td><td className="type">string</td><td>Tipo de plano. Valores usados no CRM: <C>PF</C>, <C>Familiar</C>, <C>PME</C>, <C>Adesão</C>. <C>"individual"</C> é convertido para <C>PF</C>.</td></tr>
            <tr><td><C>current_plan</C><Opt /></td><td className="type">string</td><td>Plano de saúde atual. Para quem não tem, envie <C>"Não possui plano"</C>; senão, o nome da operadora (ex.: <C>"Bradesco"</C>).</td></tr>
            <tr><td><C>faixa_0_18</C> … <C>faixa_59_mais</C><Opt /></td><td className="type">inteiro</td><td>Quantidade de vidas por faixa etária. Campos: <C>faixa_0_18</C>, <C>faixa_19_23</C>, <C>faixa_24_28</C>, <C>faixa_29_33</C>, <C>faixa_34_38</C>, <C>faixa_39_43</C>, <C>faixa_44_48</C>, <C>faixa_49_53</C>, <C>faixa_54_58</C>, <C>faixa_59_mais</C>. Padrão <C>0</C>.</td></tr>
          </Table>
        </section>

        <section id="apidoc-meta-ads">
          <h2>Mapeamento sugerido para Meta Ads</h2>
          <p>De/para entre o formulário de cadastro do Meta (Lead Ads) e os campos da API:</p>
          <Table head={['Meta Lead Ads', 'Campo na API']}>
            <tr><td><C>full_name</C></td><td><C>name</C></td></tr>
            <tr><td><C>phone_number</C></td><td><C>phone</C> (só dígitos, com DDD, sem +55)</td></tr>
            <tr><td><C>email</C></td><td><C>email</C></td></tr>
            <tr><td>Nome do formulário</td><td><C>conversion_point</C></td></tr>
            <tr><td>Nome da campanha</td><td><C>utm_campaign</C></td></tr>
            <tr><td>Nome do conjunto de anúncios</td><td><C>utm_term</C></td></tr>
            <tr><td>Nome do anúncio</td><td><C>utm_content</C></td></tr>
            <tr><td>(fixo)</td><td><C>origin</C> = <C>"Meta Ads"</C> · <C>campanha</C> = <C>"Meta"</C></td></tr>
            <tr><td>Perguntas personalizadas (plano, vidas, modalidade)</td><td><C>current_plan</C>, <C>faixa_*</C>, <C>modalidade</C>; o que não tiver campo próprio pode ir em <C>message</C></td></tr>
          </Table>
        </section>

        <section id="apidoc-respostas">
          <h2>Respostas e erros</h2>
          <p>Os erros vêm em JSON com o campo <C>detail</C>, por exemplo: <C>{'{"detail": "Chave da equipe inválida"}'}</C>.</p>
          <Table head={['Código', 'Quando acontece', 'O que fazer']}>
            <tr><td className="status s2">200</td><td><C>GET</C> com sucesso.</td><td>—</td></tr>
            <tr><td className="status s2">201</td><td>Lead cadastrado. Traz o <C>lead_id</C>.</td><td>Guardar o <C>lead_id</C> se for consultar depois.</td></tr>
            <tr><td className="status s4">403</td><td>Chave da conta ou da equipe inválida.</td><td>Conferir os cabeçalhos. Não repetir automaticamente.</td></tr>
            <tr><td className="status s4">404</td><td>Lead não encontrado (ou de outra equipe).</td><td>Conferir o <C>lead_id</C>.</td></tr>
            <tr><td className="status s4">409</td><td>Lead já cadastrado (ver duplicidade abaixo).</td><td>Tratar como sucesso: o lead já está no CRM. <strong>Não reenviar.</strong></td></tr>
            <tr><td className="status s4">422</td><td>Corpo inválido: falta <C>name</C>/<C>phone</C>, tipo errado ou JSON mal formado.</td><td>Corrigir o envio. Não repetir sem corrigir.</td></tr>
            <tr><td className="status s4">429</td><td>Limite de requisições excedido.</td><td>Aguardar 60 segundos e tentar de novo.</td></tr>
            <tr><td className="status s5">5xx</td><td>Falha temporária do servidor.</td><td>Tentar de novo com espera crescente (ex.: 30 s, 2 min, 10 min).</td></tr>
          </Table>
        </section>

        <section id="apidoc-limites">
          <h2>Limites e duplicidade</h2>
          <ul>
            <li><strong>Limite de envio:</strong> 30 requisições por minuto por IP. Em envios em lote, espace as chamadas.</li>
            <li><strong>Duplicidade:</strong> o lead é recusado com <C>409</C> quando já existe outro com o mesmo <strong>e-mail</strong>, ou com o mesmo <strong>telefone e nome</strong>. Por isso, reenviar um lead é seguro: não cria cópia.</li>
            <li><strong>Distribuição:</strong> ao entrar, o lead vai para o próximo atendente ativo da equipe (rodízio), que recebe o aviso no CRM na hora.</li>
            <li><strong>Tempo de resposta:</strong> normalmente abaixo de 1 segundo. Use um timeout de 15 segundos.</li>
          </ul>
        </section>

        <section id="apidoc-homologacao">
          <h2>Roteiro de homologação</h2>
          <ol className="apidoc-steps">
            <li>Chame <C>GET /ping</C> com as chaves recebidas. Esperado: <C>200</C> com o nome da equipe.</li>
            <li>Envie <strong>um</strong> lead de teste com <C>POST /leads</C>, com nome começando por <C>TESTE</C> (ex.: <C>"TESTE Integração Meta"</C>) e <C>origin</C> = <C>"Meta Ads"</C>. Esperado: <C>201</C> com <C>lead_id</C>.</li>
            <li>Envie o mesmo lead de novo. Esperado: <C>409</C>, sem criar cópia.</li>
            <li>Consulte com <C>GET /leads/{'{lead_id}'}</C>. Esperado: <C>200</C> com <C>status</C> = <C>novo</C>.</li>
            <li>Confira o lead no CRM e remova-o antes de ligar a campanha.</li>
          </ol>
        </section>
      </div>
    </div>
  )
}

const APIDOC_CSS = `
.apidoc { --get: #047857; --get-bg: rgba(4,120,87,.10); --post: #1D4ED8; --post-bg: rgba(29,78,216,.10);
  --code-bg: #0F172A; --code-text: #E2E8F0; --code-muted: #94A3B8; --code-key: #93C5FD; --code-str: #86EFAC;
  display: grid; grid-template-columns: 190px minmax(0, 1fr); gap: 36px; color: var(--text-1); font-size: 14.5px; line-height: 1.6; }
html.dark .apidoc { --get: #34D399; --get-bg: rgba(52,211,153,.12); --post: #93C5FD; --post-bg: rgba(147,197,253,.12); --code-bg: #0A0E16; }
.apidoc code, .apidoc pre, .apidoc-path, .apidoc-method { font-family: "JetBrains Mono", ui-monospace, Consolas, monospace; }
.apidoc-ic { font-size: .86em; background: var(--bg-subtle); border: 1px solid var(--border); border-radius: 5px; padding: 1px 5px; color: var(--text-1); word-break: break-word; }
.apidoc a { color: var(--accent); text-decoration: none; }
.apidoc a:hover { text-decoration: underline; }

.apidoc-toc { position: sticky; top: 16px; align-self: start; max-height: calc(100vh - 32px); overflow-y: auto; padding-top: 4px; }
.apidoc-toc p { font-size: 11px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--text-muted); margin: 16px 0 6px; }
.apidoc-toc > div:first-child p { margin-top: 0; }
.apidoc-toc button { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; background: none; border: none; cursor: pointer;
  color: var(--text-3); font: inherit; font-size: 13px; padding: 5px 10px; border-radius: 7px; }
.apidoc-toc button:hover { background: var(--bg-subtle); }

.apidoc-main { min-width: 0; padding-bottom: 40px; }
.apidoc-hero { padding-bottom: 22px; border-bottom: 1px solid var(--border); }
.apidoc-eyebrow { font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); margin: 0; }
.apidoc h1 { font-size: 28px; line-height: 1.15; letter-spacing: -.02em; margin: 8px 0 10px; font-weight: 700; color: var(--text-1); }
.apidoc-lead { font-size: 15.5px; color: var(--text-3); max-width: 700px; margin: 0; }
.apidoc-meta { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 14px; font-size: 12.5px; color: var(--text-muted); }

.apidoc-share { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 20px; padding: 12px 14px; border-radius: 12px;
  background: var(--accent-weak); border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent); }
.apidoc-share strong { display: block; font-size: 13.5px; color: var(--text-1); }
.apidoc-share span { display: block; font-size: 12.5px; color: var(--text-muted); }
.apidoc-keys { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 12px; font-size: 12.5px; color: var(--text-muted); }

.apidoc-btn { display: inline-flex; align-items: center; gap: 5px; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--text-3);
  background: var(--bg-card); border: 1px solid var(--border-in); border-radius: 7px; padding: 6px 11px; cursor: pointer; text-decoration: none !important; }
.apidoc-btn:hover { color: var(--text-1); }

.apidoc section { padding-top: 34px; scroll-margin-top: 16px; }
.apidoc h2 { font-size: 20px; letter-spacing: -.01em; margin: 0 0 6px; font-weight: 700; color: var(--text-1); }
.apidoc h3 { font-size: 15px; margin: 22px 0 8px; font-weight: 650; color: var(--text-1); }
.apidoc p { margin: 0 0 12px; color: var(--text-3); }
.apidoc ul, .apidoc ol { color: var(--text-3); padding-left: 20px; margin: 0 0 12px; }
.apidoc li { margin: 4px 0; }
.apidoc strong { color: var(--text-1); }

.apidoc-baseurl { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; margin: 12px 0; }
.apidoc-baseurl .label { font-size: 11.5px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; }
.apidoc-baseurl code { font-size: 14px; font-weight: 500; flex: 1; min-width: 0; word-break: break-all; color: var(--text-1); }

.apidoc-callout { border-radius: 10px; padding: 12px 16px; margin: 14px 0; font-size: 13.5px; color: var(--text-2); }
.apidoc-callout.warn { background: var(--warning-weak); border: 1px solid color-mix(in srgb, var(--warning) 30%, transparent); }

.apidoc-endpoint { background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px; margin: 14px 0 8px; overflow: hidden; }
.apidoc-endpoint-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 16px; border-bottom: 1px solid var(--border); background: var(--bg-subtle); }
.apidoc-endpoint-body { padding: 14px 16px 4px; }
.apidoc-method { font-weight: 600; font-size: 11.5px; line-height: 1; padding: 5px 8px; border-radius: 6px; letter-spacing: .03em; }
.apidoc-method.get { color: var(--get); background: var(--get-bg); }
.apidoc-method.post { color: var(--post); background: var(--post-bg); }
.apidoc-path { font-weight: 500; font-size: 14px; color: var(--text-1); word-break: break-all; }

.apidoc-table { overflow-x: auto; border: 1px solid var(--border); border-radius: 10px; margin: 10px 0 14px; background: var(--bg-card); }
.apidoc table { width: 100%; border-collapse: collapse; font-size: 13px; }
.apidoc th { text-align: left; font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--text-muted); background: var(--bg-subtle); padding: 8px 12px; border-bottom: 1px solid var(--border); white-space: nowrap; }
.apidoc td { padding: 9px 12px; border-bottom: 1px solid var(--border); vertical-align: top; color: var(--text-3); }
.apidoc tr:last-child td { border-bottom: none; }
.apidoc td:first-child .apidoc-ic { white-space: nowrap; }
.apidoc-req { font-size: 10.5px; font-weight: 600; color: var(--danger); margin-left: 6px; white-space: nowrap; }
.apidoc-opt { font-size: 10.5px; color: var(--text-muted); margin-left: 6px; white-space: nowrap; }
.apidoc .type { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 12px; color: var(--text-muted); white-space: nowrap; }
.apidoc .status { font-family: "JetBrains Mono", ui-monospace, monospace; font-weight: 600; font-size: 12.5px; white-space: nowrap; }
.apidoc .s2 { color: var(--get); } .apidoc .s4 { color: var(--warning); } .apidoc .s5 { color: var(--danger); }

.apidoc-code { background: var(--code-bg); border-radius: 10px; margin: 10px 0 14px; overflow: hidden; }
.apidoc-code-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 6px 8px 6px 14px; border-bottom: 1px solid rgba(255,255,255,.07); }
.apidoc-code-head > span { font-size: 11.5px; color: var(--code-muted); font-weight: 500; letter-spacing: .03em; }
.apidoc-copy { display: inline-flex; align-items: center; gap: 4px; font: inherit; font-size: 11.5px; font-weight: 500; color: var(--code-muted);
  background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.10); border-radius: 6px; padding: 4px 9px; cursor: pointer; white-space: nowrap; }
.apidoc-copy:hover { color: #fff; }
.apidoc pre { margin: 0; padding: 13px 16px; overflow-x: auto; color: var(--code-text); font-size: 12.5px; line-height: 1.6; }
.apidoc pre .k { color: var(--code-key); } .apidoc pre .s { color: var(--code-str); } .apidoc pre .c { color: var(--code-muted); }

.apidoc-tabs { display: flex; gap: 4px; margin: 10px 0 -4px; flex-wrap: wrap; }
.apidoc-tab { font: inherit; font-size: 12.5px; font-weight: 500; border: 1px solid var(--border); background: var(--bg-card); color: var(--text-muted); border-radius: 7px; padding: 5px 11px; cursor: pointer; }
.apidoc-tab[aria-selected="true"] { color: var(--accent); border-color: var(--accent); background: var(--accent-weak); }

.apidoc-steps { counter-reset: s; list-style: none; padding: 0 !important; }
.apidoc-steps li { counter-increment: s; position: relative; padding: 2px 0 10px 40px; }
.apidoc-steps li::before { content: counter(s); position: absolute; left: 0; top: 0; width: 26px; height: 26px; border-radius: 50%; background: var(--accent-weak);
  color: var(--accent); font-weight: 600; font-size: 13px; display: flex; align-items: center; justify-content: center; }

@media (max-width: 900px) {
  .apidoc { grid-template-columns: 1fr; gap: 0; }
  .apidoc-toc { display: none; }
}
`
