import type { DesignSystemData } from "@/types/design-system"
import { Header, TreeNode } from "@/components/shared"

export function TreeView({ data, setSelectedComp }: { data: DesignSystemData, setSelectedComp: (comp: any) => void }) {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <Header title="Component Tree" subtitle="Hierarchical view of all detected components" />
      <div className="bg-card border border-border rounded-xl p-6 font-mono text-xs leading-relaxed">
        {data.components.filter(c => !c.parentId).map(root => (
          <TreeNode key={root.id} comp={root} allComps={data.components} depth={0} onOpen={setSelectedComp} />
        ))}
      </div>
    </div>
  )
}
