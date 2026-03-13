import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

export function MarkdownContent({ content }: { content: string }) {
    return (
        <div className="prose prose-sm max-w-none min-w-0 text-[14px] leading-relaxed text-foreground break-words [overflow-wrap:anywhere]
            prose-p:my-1.5 prose-p:text-muted-foreground prose-p:break-words prose-p:[overflow-wrap:anywhere]
            prose-headings:text-foreground prose-headings:mt-3 prose-headings:mb-1.5 prose-headings:text-sm prose-headings:font-semibold
            prose-code:text-primary prose-code:bg-primary/5 prose-code:rounded-md prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[12px] prose-code:font-mono prose-code:break-all
            prose-pre:bg-muted/50 prose-pre:rounded-xl prose-pre:my-3 prose-pre:text-[12px] prose-pre:border prose-pre:border-border prose-pre:p-4 prose-pre:overflow-x-auto prose-pre:whitespace-pre-wrap prose-pre:break-words prose-pre:w-full prose-pre:max-w-full
            prose-strong:text-foreground prose-strong:font-semibold
            prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-li:text-muted-foreground
            prose-a:text-primary prose-a:no-underline hover:prose-a:underline
            prose-blockquote:border-l-2 prose-blockquote:border-border prose-blockquote:text-muted-foreground prose-blockquote:pl-4 prose-blockquote:my-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
            </ReactMarkdown>
        </div>
    )
}
