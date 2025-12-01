import { Card } from "./ui/card";
import { Search, GitBranch, Zap, FileText } from "lucide-react";

interface RetrievalDebugProps {
  data: {
    vectorSearch: {
      chunks: number;
      avgScore: number;
      latency: number;
    };
    graphExpansion: {
      added: number;
      dependencies: number;
      types: number;
      callers: number;
    };
    llmReranking: {
      filtered: number;
      tokensUsed: number;
    };
    finalContext: {
      chunks: number;
      tokens: number;
      contextUsage: number;
    };
  };
}

export function RetrievalDebug({ data }: RetrievalDebugProps) {
  return (
    <Card className="mt-4 p-4 bg-surface border-warning/30">
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Search className="w-4 h-4 text-warning" />
          Retrieval Details
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Search className="w-3 h-3" />
              Stage 1: Vector Search
            </div>
            <div className="pl-5 space-y-1 text-muted-foreground">
              <div>• Found {data.vectorSearch.chunks} chunks (avg score: {data.vectorSearch.avgScore})</div>
              <div>• Latency: {data.vectorSearch.latency}ms</div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <GitBranch className="w-3 h-3" />
              Stage 2: Graph Expansion
            </div>
            <div className="pl-5 space-y-1 text-muted-foreground">
              <div>• Added {data.graphExpansion.added} related chunks</div>
              <div>
                • Dependencies: {data.graphExpansion.dependencies}, Types: {data.graphExpansion.types}, 
                Callers: {data.graphExpansion.callers}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Zap className="w-3 h-3" />
              Stage 3: LLM Reranking
            </div>
            <div className="pl-5 space-y-1 text-muted-foreground">
              <div>• Filtered to {data.llmReranking.filtered} chunks</div>
              <div>• Tokens used: {data.llmReranking.tokensUsed.toLocaleString()}</div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <FileText className="w-3 h-3" />
              Final Context
            </div>
            <div className="pl-5 space-y-1 text-muted-foreground">
              <div>• Total chunks: {data.finalContext.chunks}</div>
              <div>• Total tokens: {data.finalContext.tokens.toLocaleString()}</div>
              <div>• Context usage: {data.finalContext.contextUsage}% of 200k</div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
