import type { DesignSystemData } from "@/types/design-system"
import { Header } from "@/components/shared"
import { Card } from "@/components/ui/card"

export function TypographyView({ data }: { data: DesignSystemData }) {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <Header title="Typography" subtitle={`${data.tokens.typography.length} unique type styles`} />
      <div className="flex flex-col gap-3">
        {data.tokens.typography.map((t, i) => (
          <Card key={i} className="bg-muted/30 border-border p-4 md:p-6 flex flex-col md:flex-row items-start md:items-center gap-6 md:gap-8">
            <div 
              className="flex-1 overflow-hidden" 
              style={{
                fontSize: t.fontSize,
                fontWeight: t.fontWeight,
                fontFamily: t.fontFamily,
                lineHeight: t.lineHeight,
                color: t.color
              }}
            >
              <span className="truncate block max-w-full">{t.sample || 'The quick brown fox jumps over the lazy dog'}</span>
            </div>
            <div className="text-right font-mono text-xs text-muted-foreground flex flex-col gap-1 min-w-[200px] shrink-0 border-l border-border pl-6">
              <span className="text-foreground">{t.fontSize} • {t.fontWeight}</span>
              <span className="truncate max-w-[200px]" title={t.fontFamily}>{t.fontFamily.split(',')[0].replace(/['"]/g, '')}</span>
              <span>LH {t.lineHeight} • LS {t.letterSpacing}</span>
              <span>Instances: {t.count}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
