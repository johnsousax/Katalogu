import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, LocateFixed, Navigation, Phone } from 'lucide-react'

/**
 * Mapa da entrega dentro do app do motoboy: rota de onde ele está até o cliente (ou todas as paradas da rota),
 * sem sair do app. O GPS segue ligado e a loja continua vendo ele no mapa.
 * Navegação por voz (curva a curva) só existe no app do Google Maps/Waze; o botão abre direto no modo navegação.
 */
export type Parada = { numero: number; cliente_nome: string | null; cliente_telefone: string | null; endereco: Record<string, string>; endereco_texto: string | null; mapa: string | null }

/** Destino em texto para o Google: coordenada, ou o endereço com cidade que já vem no link do mapa */
function destino(x: Parada) {
  if (x.endereco?.lat && x.endereco?.lng) return `${x.endereco.lat},${x.endereco.lng}`
  try {
    const q = x.mapa ? new URL(x.mapa).searchParams.get('query') : null
    if (q) return q
  } catch { /* link estranho: usa o texto */ }
  return x.endereco_texto ?? ''
}
const metros = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371000, rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function MapaEntrega({ paradas, fechar }: { paradas: Parada[]; fechar: () => void }) {
  const destinos = useMemo(() => paradas.map(destino).filter(Boolean), [paradas])
  // origem do traçado: só muda quando o motoboy andou bastante, para o mapa não ficar recarregando
  const [origem, setOrigem] = useState<{ lat: number; lng: number } | null>(null)
  const atual = useRef<{ lat: number; lng: number } | null>(null)
  const ultimaTroca = useRef(0)

  useEffect(() => {
    if (!('geolocation' in navigator)) return
    const id = navigator.geolocation.watchPosition((pos) => {
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      atual.current = p
      setOrigem((o) => {
        if (!o) { ultimaTroca.current = Date.now(); return p }
        if (metros(o, p) > 400 && Date.now() - ultimaTroca.current > 45_000) { ultimaTroca.current = Date.now(); return p }
        return o
      })
    }, () => { /* sem GPS: mostra só o destino */ }, { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 })
    return () => navigator.geolocation.clearWatch(id)
  }, [])
  // botão voltar do celular fecha o mapa em vez de sair do app
  const aoFechar = useRef(fechar)
  aoFechar.current = fechar
  useEffect(() => {
    const voltar = () => aoFechar.current()
    window.history.pushState({ mapa: true }, '')
    window.addEventListener('popstate', voltar)
    return () => window.removeEventListener('popstate', voltar)
  }, [])

  const daddr = destinos.map(encodeURIComponent).join('+to:')
  const src = origem
    ? `https://maps.google.com/maps?saddr=${origem.lat},${origem.lng}&daddr=${daddr}&dirflg=d&hl=pt-BR&output=embed`
    : `https://maps.google.com/maps?q=${encodeURIComponent(destinos[0] ?? '')}&z=16&hl=pt-BR&output=embed`
  const ultimo = destinos[destinos.length - 1] ?? ''
  const meio = destinos.slice(0, -1)
  const navegar = `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=${encodeURIComponent(ultimo)}${meio.length ? `&waypoints=${encodeURIComponent(meio.join('|'))}` : ''}`
  const primeiro = paradas[0]
  const waze = primeiro?.endereco?.lat && primeiro?.endereco?.lng
    ? `https://waze.com/ul?ll=${primeiro.endereco.lat},${primeiro.endereco.lng}&navigate=yes`
    : `https://waze.com/ul?q=${encodeURIComponent(destinos[0] ?? '')}&navigate=yes`
  const recentrar = () => { if (atual.current) { ultimaTroca.current = Date.now(); setOrigem({ ...atual.current }) } }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center gap-2 px-3 pb-2 pt-[calc(10px+env(safe-area-inset-top))]" style={{ background: 'var(--cor)', color: 'var(--cor-texto)' }}>
        <button onClick={() => window.history.back()} className="grid h-10 w-10 place-items-center rounded-full bg-white/15" aria-label="Voltar"><ChevronLeft className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">{paradas.length > 1 ? `Rota com ${paradas.length} entregas` : `#${primeiro?.numero} · ${primeiro?.cliente_nome ?? 'Cliente'}`}</div>
          <div className="truncate text-[12px] opacity-85">{paradas.length > 1 ? paradas.map((x) => x.endereco?.bairro || `#${x.numero}`).join(' → ') : primeiro?.endereco_texto}</div>
        </div>
        {paradas.length === 1 && primeiro?.cliente_telefone && <a href={`tel:+${primeiro.cliente_telefone}`} className="grid h-10 w-10 place-items-center rounded-full bg-white/15" aria-label="Ligar"><Phone className="h-4 w-4" /></a>}
      </div>
      <div className="relative flex-1 bg-fundo">
        {destinos.length ? <iframe key={src} title="Mapa da entrega" src={src} className="absolute inset-0 h-full w-full border-0" loading="eager" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
          : <div className="grid h-full place-items-center px-6 text-center text-sm text-tinta-3">Esta entrega não tem endereço para mostrar no mapa.</div>}
        {origem && <button onClick={recentrar} className="absolute bottom-3 right-3 grid h-11 w-11 place-items-center rounded-full bg-white shadow-cartao" aria-label="Atualizar minha posição"><LocateFixed className="h-5 w-5" style={{ color: 'var(--cor)' }} /></button>}
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-linha px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">
        <a href={navegar} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center gap-2 rounded-xl text-[14px] font-semibold" style={{ background: 'var(--cor)', color: 'var(--cor-texto)' }}><Navigation className="h-4 w-4" />Navegar com voz</a>
        <a href={waze} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center gap-2 rounded-xl border border-linha-2 text-[14px] font-semibold">Abrir no Waze</a>
        <p className="col-span-2 text-center text-[11px] text-tinta-3">Usando o mapa aqui, a loja continua vendo você. A voz curva a curva abre no Google Maps: depois volte para este app para marcar a entrega.</p>
      </div>
    </div>
  )
}
