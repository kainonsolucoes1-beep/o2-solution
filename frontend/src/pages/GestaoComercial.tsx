import { useState } from 'react'

const TABS = ['Visão Geral', 'Pipeline', 'Performance'] as const
type Tab = typeof TABS[number]

export default function GestaoComercial() {
  const [activeTab, setActiveTab] = useState<Tab>('Visão Geral')

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Gestão Comercial</h1>
        <p style={{ fontSize: 13, color: 'var(--text-subtle)', marginTop: 4 }}>Acompanhe resultados, pipeline e performance da equipe</p>
      </div>

      {/* Sub-tabs */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 28,
        borderBottom: '2px solid var(--border)',
        paddingBottom: 0,
      }}>
        {TABS.map(tab => {
          const active = activeTab === tab
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '9px 20px',
                fontSize: 13, fontWeight: active ? 700 : 500,
                color: active ? '#2563EB' : 'var(--text-subtle)',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: active ? '2px solid #2563EB' : '2px solid transparent',
                marginBottom: -2,
                borderRadius: 0,
                transition: 'color 150ms, border-color 150ms',
              }}
            >
              {tab}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {activeTab === 'Visão Geral' && (
        <div style={{ color: 'var(--text-subtle)', fontSize: 13 }}>
          {/* Implementação a definir */}
        </div>
      )}

      {activeTab === 'Pipeline' && (
        <div style={{ color: 'var(--text-subtle)', fontSize: 13 }}>
          {/* Implementação a definir */}
        </div>
      )}

      {activeTab === 'Performance' && (
        <div style={{ color: 'var(--text-subtle)', fontSize: 13 }}>
          {/* Implementação a definir */}
        </div>
      )}
    </div>
  )
}
