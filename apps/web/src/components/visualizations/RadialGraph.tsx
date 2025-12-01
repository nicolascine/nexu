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

interface RadialGraphViewProps {
  graphData: GraphData;
  onNodeClick?: (node: Node) => void;
}

export function RadialGraphView({ graphData, onNodeClick }: RadialGraphViewProps) {
  const graphRef = useRef<any>();
  const { themeInfo } = useCodeTheme();
  const isDark = themeInfo.isDark;

  useEffect(() => {
    if (graphRef.current) {
      const fg = graphRef.current;
      
      const packages = graphData.nodes.filter(n => n.type === "package");
      const files = graphData.nodes.filter(n => n.type === "file");
      const others = graphData.nodes.filter(n => !["package", "file"].includes(n.type));

      const angleStep = (2 * Math.PI) / Math.max(packages.length, 1);
      
      packages.forEach((node: any, i) => {
        const angle = i * angleStep;
        node.fx = Math.cos(angle) * 100;
        node.fy = Math.sin(angle) * 100;
      });

      const fileAngleStep = (2 * Math.PI) / Math.max(files.length, 1);
      files.forEach((node: any, i) => {
        const angle = i * fileAngleStep;
        node.fx = Math.cos(angle) * 250;
        node.fy = Math.sin(angle) * 250;
      });

      const otherAngleStep = (2 * Math.PI) / Math.max(others.length, 1);
      others.forEach((node: any, i) => {
        const angle = i * otherAngleStep;
        node.fx = Math.cos(angle) * 400;
        node.fy = Math.sin(angle) * 400;
      });

      fg.d3Force("charge").strength(-100);
      fg.d3Force("link").distance(50);

      setTimeout(() => {
        fg.zoomToFit(400);
      }, 500);
    }
  }, [graphData]);

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
        
        ctx.font = `500 ${fontSize}px ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif`;
        
        const width = Math.max(ctx.measureText(label).width + 12, 20);
        const height = fontSize + 8;
        const radius = 4;
        
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
      linkColor={() => isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"}
      linkWidth={0.5}
      backgroundColor={isDark ? "hsl(0, 0%, 8%)" : "hsl(0, 0%, 100%)"}
      onNodeClick={(node: any) => {
        if (onNodeClick) {
          onNodeClick(node);
        }
      }}
    />
  );
}