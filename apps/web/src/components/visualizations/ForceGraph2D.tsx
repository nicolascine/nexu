import { useRef, useEffect } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { useCodeTheme } from "@/hooks/use-code-theme";

interface Node {
  id: string;
  name: string;
  type: string;
  val: number;
  color?: string;
}

interface Link {
  source: string;
  target: string;
  type: string;
}

interface GraphData {
  nodes: Node[];
  links: Link[];
}

interface ForceGraph2DViewProps {
  graphData: GraphData;
  onNodeClick?: (node: Node) => void;
}

export function ForceGraph2DView({ graphData, onNodeClick }: ForceGraph2DViewProps) {
  const graphRef = useRef<any>();
  const { themeInfo } = useCodeTheme();
  const isDark = themeInfo.isDark;

  useEffect(() => {
    if (graphRef.current) {
      setTimeout(() => {
        graphRef.current?.zoomToFit(400);
      }, 100);
    }
  }, []);

  // Notion-style muted colors
  const getNodeColor = (type: string) => {
    if (isDark) {
      switch (type) {
        case "package": return "#9B9B9B";
        case "file": return "#787878";
        case "class": return "#A8A8A8";
        case "function": return "#8A8A8A";
        case "interface": return "#6B6B6B";
        default: return "#888888";
      }
    } else {
      switch (type) {
        case "package": return "#37352F";
        case "file": return "#5C5C5C";
        case "class": return "#4A4A4A";
        case "function": return "#6B6B6B";
        case "interface": return "#787878";
        default: return "#555555";
      }
    }
  };

  return (
    <ForceGraph2D
      ref={graphRef}
      graphData={graphData}
      nodeLabel={(node: any) => `${node.name} (${node.type})`}
      nodeVal={(node: any) => node.val * 0.8}
      nodeCanvasObject={(node: any, ctx, globalScale) => {
        if (node.x === undefined || node.y === undefined) return;
        
        const label = node.name;
        const fontSize = Math.max(11 / globalScale, 3);
        const nodeSize = node.val * 0.8;
        
        // Draw node - rounded rectangle for Notion style
        const width = Math.max(ctx.measureText(label).width + 12, nodeSize * 2);
        const height = fontSize + 8;
        const radius = 4;
        
        ctx.font = `500 ${fontSize}px ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif`;
        
        // Background
        ctx.beginPath();
        ctx.roundRect(node.x - width/2, node.y - height/2, width, height, radius);
        ctx.fillStyle = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)";
        ctx.fill();
        
        // Border
        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)";
        ctx.lineWidth = 1 / globalScale;
        ctx.stroke();
        
        // Text
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = getNodeColor(node.type);
        ctx.fillText(label, node.x, node.y);
      }}
      linkColor={() => isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}
      linkWidth={1}
      backgroundColor={isDark ? "hsl(0, 0%, 8%)" : "hsl(0, 0%, 100%)"}
      onNodeClick={(node: any) => {
        if (onNodeClick) {
          onNodeClick(node);
        }
      }}
      cooldownTicks={100}
      onEngineStop={() => graphRef.current?.zoomToFit(400)}
    />
  );
}