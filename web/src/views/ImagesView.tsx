import type { DesignSystemData } from "@/types/design-system"
import { Header } from "@/components/shared"
import { Card } from "@/components/ui/card"
import { useOutputUrl } from "@/lib/output-base"

export function ImagesView({ data }: { data: DesignSystemData }) {
  const outputUrl = useOutputUrl()
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <Header title="Images" subtitle={`${data.assets.images.length} images extracted`} />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {data.assets.images.map((img, i) => (
          <Card key={i} className="bg-card border-border overflow-hidden">
            <div className="h-32 bg-muted/50 flex items-center justify-center p-4 border-b border-border">
              <img
                src={img.localPath ? outputUrl(img.localPath) : img.src}
                alt={img.alt || "Extracted image"}
                className="max-w-full max-h-full object-contain"
                loading="lazy"
                onError={(e) => {
                  const target = e.target as HTMLElement;
                  target.outerHTML = '<div class="text-muted-foreground text-xs text-center flex flex-col items-center"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mb-2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>Failed to load</div>';
                }}
              />
            </div>
            <div className="p-3 font-mono text-[10px] text-muted-foreground flex justify-between">
              <span className="truncate pr-2" title={img.alt}>{img.alt || "No alt text"}</span>
              <span className="shrink-0">{Math.round(img.width)}×{Math.round(img.height)}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
