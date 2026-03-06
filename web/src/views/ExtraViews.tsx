export function GradientsView({ data }: { data: any }) {
  const g = data.tokens.gradients
  if (!g || !g.length) return <div className="text-muted-foreground p-8 text-center">No gradients</div>
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Gradients</h1>
        <p className="text-sm text-muted-foreground">{g.length} gradients</p>
      </div>
      <div className="flex flex-col gap-3">
        {g.map((gr: any, i: number) => (
          <div key={i} className="bg-card border border-border rounded-md overflow-hidden">
            <div className="h-16" style={{ background: gr.value }}></div>
            <div className="p-3 text-xs font-mono text-muted-foreground break-all">{gr.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function BordersView({ data }: { data: any }) {
  const b = data.tokens.borders
  if (!b || !b.length) return <div className="text-muted-foreground p-8 text-center">No borders</div>
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Borders</h1>
        <p className="text-sm text-muted-foreground">{b.length} border styles</p>
      </div>
      <div className="flex flex-col gap-2">
        {b.map((br: any, i: number) => (
          <div key={i} className="bg-card border border-border rounded-md p-3 font-mono text-xs flex gap-3">
            <div className="text-indigo-400 min-w-[200px]" style={{ borderBottom: br.value, paddingBottom: 4 }}>{br.value}</div>
            <div className="text-muted-foreground">×{br.count}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TransitionsView({ data }: { data: any }) {
  const t = data.tokens.transitions
  if (!t || !t.length) return <div className="text-muted-foreground p-8 text-center">No transitions</div>
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Transitions</h1>
        <p className="text-sm text-muted-foreground">{t.length} transition definitions</p>
      </div>
      <div className="flex flex-col gap-2">
        {t.map((tr: any, i: number) => (
          <div key={i} className="bg-card border border-border rounded-md p-3 font-mono text-xs flex gap-3">
            <div className="text-indigo-400 min-w-[200px]">{tr.value}</div>
            <div className="text-muted-foreground">×{tr.count}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function CssVarsView({ data }: { data: any }) {
  const v = data.cssVariables
  if (!v || !v.length) return <div className="text-muted-foreground p-8 text-center">No CSS variables</div>
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">CSS Custom Properties</h1>
        <p className="text-sm text-muted-foreground">{v.length} variables</p>
      </div>
      <div className="flex flex-col gap-2">
        {v.map((vr: any, i: number) => {
          const isColor = vr.value.match(/^#[0-9a-f]{3,8}$/i) || vr.value.match(/^rgb/)
          return (
            <div key={i} className="bg-card border border-border rounded-md p-3 font-mono text-xs flex gap-3">
              <div className="text-indigo-400 min-w-[200px]">{vr.name}</div>
              <div className="text-foreground flex-1 break-all flex items-center gap-2">
                {isColor && <span className="inline-block w-4 h-4 rounded-sm border border-border" style={{ background: vr.value }}></span>}
                {vr.value}
              </div>
              <div className="text-muted-foreground text-[10px] whitespace-nowrap">{vr.selector}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function FontFilesView({ data }: { data: any }) {
  const f = data.fontFaces
  if (!f || !f.length) return <div className="text-muted-foreground p-8 text-center">No font faces</div>
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Font Files</h1>
        <p className="text-sm text-muted-foreground">{f.length} font faces</p>
      </div>
      <div className="flex flex-col gap-2">
        {f.map((ff: any, i: number) => (
          <div key={i} className="bg-card border border-border rounded-md p-3 font-mono text-xs flex gap-3 items-center">
            <div className="text-indigo-400 min-w-[200px]" style={{ fontFamily: `"${ff.family}", sans-serif`, fontWeight: ff.weight }}>{ff.family}</div>
            <div className="text-foreground flex-1">weight: {ff.weight} · style: {ff.style} {ff.format && ` · ${ff.format}`}</div>
            {ff.localPath && (
              <a href={`/output/${ff.localPath}`} download className="text-indigo-500 hover:underline shrink-0">Download</a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export function HoversView({ data, setSelectedComp }: { data: any, setSelectedComp?: any }) {
  const h = data.interactions?.hoverStates || []
  if (!h.length) return <div className="text-muted-foreground p-8 text-center">No hover states captured</div>
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hover States</h1>
        <p className="text-sm text-muted-foreground">{h.length} components with hover changes</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {h.map((hv: any, i: number) => {
          const comp = data.components.find((c: any) => c.id === hv.componentId)
          return (
            <div key={i} className="bg-card border border-border rounded-md overflow-hidden cursor-pointer hover:border-indigo-500 transition-colors" onClick={() => setSelectedComp && comp && setSelectedComp(comp)}>
              <div className="flex border-b border-border">
                <div className="flex-1 p-3 flex flex-col items-center justify-center min-h-[80px] bg-muted/30 border-r border-border">
                  <div className="text-[9px] text-muted-foreground font-semibold tracking-wider mb-2">DEFAULT</div>
                  {comp?.screenshot && <img src={`/output/${comp.screenshot}`} className="max-h-[120px] object-contain rounded-sm" />}
                </div>
                <div className="flex-1 p-3 flex flex-col items-center justify-center min-h-[80px] bg-muted/30">
                  <div className="text-[9px] text-muted-foreground font-semibold tracking-wider mb-2">HOVER</div>
                  {hv.screenshotHover && <img src={`/output/${hv.screenshotHover}`} className="max-h-[120px] object-contain rounded-sm" />}
                </div>
              </div>
              <div className="p-4">
                <div className="text-xs font-semibold mb-2">{hv.componentName} <span className="font-normal text-muted-foreground">· {hv.componentType}</span></div>
                {Object.entries(hv.changes || {}).map(([k, v]: [string, any], j) => (
                  <div key={j} className="text-[11px] font-mono py-1 flex gap-2">
                    <span className="text-muted-foreground min-w-[100px]">{k}</span>
                    <span className="text-red-400">{v.from}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="text-green-500">{v.to}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function LayoutSystemView({ data }: { data: any }) {
  const ls = data.layoutSystem
  if (!ls) return <div className="text-muted-foreground p-8 text-center">No layout system data</div>
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Layout System</h1>
        <p className="text-sm text-muted-foreground">Container widths and layout rules</p>
      </div>
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Container Max-Widths</h3>
        {ls.containerWidths?.length ? (
          <div className="flex flex-wrap gap-3">
            {ls.containerWidths.map((w: number, i: number) => (
              <div key={i} className="bg-card border border-border rounded-md px-4 py-3 text-center min-w-[80px]">
                <div className="text-xl font-bold text-indigo-500">{w}</div>
                <div className="text-[10px] text-muted-foreground">px</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No container widths detected</div>
        )}
      </div>
    </div>
  )
}

export function PseudoElementsView({ data }: { data: any }) {
  const p = data.assets.pseudoElements
  if (!p || !p.length) return <div className="text-muted-foreground p-8 text-center">No pseudo-elements</div>
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pseudo Elements</h1>
        <p className="text-sm text-muted-foreground">{p.length} ::before / ::after elements</p>
      </div>
      <div className="flex flex-col gap-2">
        {p.map((pe: any, i: number) => (
          <div key={i} className="bg-card border border-border rounded-md p-3 font-mono text-xs flex gap-3">
            <div className="text-indigo-400 min-w-[200px]">{pe.parentTag}{pe.selector}</div>
            <div className="text-foreground flex-1 break-all">
              content: {pe.content}
              {pe.styles?.backgroundColor && pe.styles.backgroundColor !== 'rgba(0, 0, 0, 0)' ? ` · bg: ${pe.styles.backgroundColor}` : ''}
              {pe.styles?.width && pe.styles.width !== 'auto' ? ` · ${pe.styles.width} × ${pe.styles.height}` : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function VideosView({ data }: { data: any }) {
  const v = data.assets.videos
  if (!v || !v.length) return <div className="text-muted-foreground p-8 text-center">No videos</div>
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Videos</h1>
        <p className="text-sm text-muted-foreground">{v.length} video elements</p>
      </div>
      <div className="flex flex-col gap-2">
        {v.map((vid: any, i: number) => (
          <div key={i} className="bg-card border border-border rounded-md p-3 font-mono text-xs flex gap-3">
            <div className="text-indigo-400 min-w-[100px]">&lt;{vid.tag}&gt;</div>
            <div className="text-foreground flex-1 truncate">{vid.src}</div>
            <div className="text-muted-foreground whitespace-nowrap">{Math.round(vid.width)}×{Math.round(vid.height)}px</div>
          </div>
        ))}
      </div>
    </div>
  )
}