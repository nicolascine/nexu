import { useEffect, useRef, useState } from "react";
import ForceGraph3D from "react-force-graph-3d";
import { useCodeTheme } from "@/hooks/use-code-theme";
import * as THREE from "three";
import { GraphToolbar, GraphMode } from "./GraphToolbar";
import { ForceGraph2DView } from "./visualizations/ForceGraph2D";
import { TreeGraphView } from "./visualizations/TreeGraph";
import { RadialGraphView } from "./visualizations/RadialGraph";

interface Node {
  id: string;
  name: string;
  type: "package" | "file" | "function" | "class" | "interface";
  val: number;
  color?: string;
}

interface Link {
  source: string;
  target: string;
  type: "imports" | "calls" | "extends" | "implements";
}

interface GraphData {
  nodes: Node[];
  links: Link[];
}

// Notion-style muted color palette
const getColorMap = (isDark: boolean) => ({
  package: isDark ? "#9B9B9B" : "#37352F",
  file: isDark ? "#787878" : "#5C5C5C",
  function: isDark ? "#8A8A8A" : "#6B6B6B",
  class: isDark ? "#A8A8A8" : "#4A4A4A",
  interface: isDark ? "#6B6B6B" : "#787878",
});

const generateGraphData = (theme: string, codebaseId?: string): GraphData => {
  const isDark = theme === "dark";
  const colorMap = getColorMap(isDark);
  
  const packages = [
    { id: "web", name: "@app/web", type: "package" as const, val: 35 },
    { id: "api", name: "@app/api", type: "package" as const, val: 30 },
    { id: "lib", name: "@app/lib", type: "package" as const, val: 25 },
    { id: "ui", name: "@app/ui", type: "package" as const, val: 20 },
    { id: "prisma", name: "@app/prisma", type: "package" as const, val: 22 },
    { id: "types", name: "@app/types", type: "package" as const, val: 18 },
    { id: "utils", name: "@app/utils", type: "package" as const, val: 15 },
    { id: "config", name: "@app/config", type: "package" as const, val: 12 },
  ];

  const files = [
    { id: "slots.ts", name: "slots.ts", type: "file" as const, val: 12, package: "lib" },
    { id: "booking.ts", name: "booking.ts", type: "file" as const, val: 14, package: "lib" },
    { id: "availability.ts", name: "availability.ts", type: "file" as const, val: 10, package: "lib" },
    { id: "calendar.ts", name: "calendar.ts", type: "file" as const, val: 11, package: "lib" },
    { id: "events.ts", name: "events.ts", type: "file" as const, val: 9, package: "lib" },
    { id: "book-api.ts", name: "[...book].ts", type: "file" as const, val: 12, package: "api" },
    { id: "event-types.ts", name: "event-types.ts", type: "file" as const, val: 10, package: "api" },
    { id: "webhooks.ts", name: "webhooks.ts", type: "file" as const, val: 8, package: "api" },
    { id: "payments.ts", name: "payments.ts", type: "file" as const, val: 11, package: "api" },
    { id: "auth.ts", name: "auth.ts", type: "file" as const, val: 13, package: "api" },
    { id: "schedule.tsx", name: "schedule.tsx", type: "file" as const, val: 10, package: "web" },
    { id: "booking-page.tsx", name: "booking.tsx", type: "file" as const, val: 9, package: "web" },
    { id: "settings.tsx", name: "settings.tsx", type: "file" as const, val: 8, package: "web" },
    { id: "dashboard.tsx", name: "dashboard.tsx", type: "file" as const, val: 11, package: "web" },
    { id: "calendar-ui.tsx", name: "calendar.tsx", type: "file" as const, val: 9, package: "ui" },
    { id: "date-picker.tsx", name: "date-picker.tsx", type: "file" as const, val: 7, package: "ui" },
    { id: "time-select.tsx", name: "time-select.tsx", type: "file" as const, val: 6, package: "ui" },
    { id: "avatar.tsx", name: "avatar.tsx", type: "file" as const, val: 5, package: "ui" },
    { id: "schema.prisma", name: "schema.prisma", type: "file" as const, val: 18, package: "prisma" },
    { id: "client.ts", name: "client.ts", type: "file" as const, val: 8, package: "prisma" },
    { id: "booking-types.ts", name: "booking.d.ts", type: "file" as const, val: 7, package: "types" },
    { id: "event-types.d.ts", name: "event.d.ts", type: "file" as const, val: 6, package: "types" },
    { id: "user-types.ts", name: "user.d.ts", type: "file" as const, val: 5, package: "types" },
    { id: "date-utils.ts", name: "date.ts", type: "file" as const, val: 6, package: "utils" },
    { id: "validation.ts", name: "validation.ts", type: "file" as const, val: 7, package: "utils" },
  ];

  const classes = [
    { id: "BookingService", name: "BookingService", type: "class" as const, val: 8, file: "booking.ts" },
    { id: "EventManager", name: "EventManager", type: "class" as const, val: 7, file: "events.ts" },
    { id: "CalendarSync", name: "CalendarSync", type: "class" as const, val: 6, file: "calendar.ts" },
    { id: "PaymentProcessor", name: "PaymentProcessor", type: "class" as const, val: 7, file: "payments.ts" },
  ];

  const functions = [
    { id: "checkAvailability", name: "checkAvailability()", type: "function" as const, val: 6, file: "slots.ts" },
    { id: "createBooking", name: "createBooking()", type: "function" as const, val: 7, file: "booking.ts" },
    { id: "getSlots", name: "getSlots()", type: "function" as const, val: 5, file: "availability.ts" },
    { id: "validateSlot", name: "validateSlot()", type: "function" as const, val: 4, file: "slots.ts" },
    { id: "updateBooking", name: "updateBooking()", type: "function" as const, val: 5, file: "booking.ts" },
    { id: "bookHandler", name: "handler()", type: "function" as const, val: 6, file: "book-api.ts" },
    { id: "createEventType", name: "createEventType()", type: "function" as const, val: 5, file: "event-types.ts" },
    { id: "webhookHandler", name: "handleWebhook()", type: "function" as const, val: 5, file: "webhooks.ts" },
    { id: "processPayment", name: "processPayment()", type: "function" as const, val: 6, file: "payments.ts" },
    { id: "formatDate", name: "formatDate()", type: "function" as const, val: 3, file: "date-utils.ts" },
    { id: "validateEmail", name: "validateEmail()", type: "function" as const, val: 3, file: "validation.ts" },
  ];

  const interfaces = [
    { id: "IBooking", name: "IBooking", type: "interface" as const, val: 4, file: "booking-types.ts" },
    { id: "IEvent", name: "IEvent", type: "interface" as const, val: 4, file: "event-types.d.ts" },
    { id: "IUser", name: "IUser", type: "interface" as const, val: 4, file: "user-types.ts" },
  ];

  const nodes = [
    ...packages.map(p => ({ ...p, color: colorMap.package })),
    ...files.map(f => ({ ...f, color: colorMap.file })),
    ...classes.map(c => ({ ...c, color: colorMap.class })),
    ...functions.map(f => ({ ...f, color: colorMap.function })),
    ...interfaces.map(i => ({ ...i, color: colorMap.interface })),
  ];

  const links: Link[] = [
    { source: "web", target: "lib", type: "imports" as const },
    { source: "web", target: "ui", type: "imports" as const },
    { source: "web", target: "types", type: "imports" as const },
    { source: "api", target: "lib", type: "imports" as const },
    { source: "api", target: "prisma", type: "imports" as const },
    { source: "api", target: "types", type: "imports" as const },
    { source: "lib", target: "prisma", type: "imports" as const },
    { source: "lib", target: "types", type: "imports" as const },
    { source: "lib", target: "utils", type: "imports" as const },
    { source: "ui", target: "utils", type: "imports" as const },
    { source: "web", target: "config", type: "imports" as const },
    { source: "api", target: "config", type: "imports" as const },
    ...files.map(f => ({ source: f.id, target: f.package, type: "imports" as const })),
    ...classes.map(c => ({ source: c.id, target: c.file, type: "imports" as const })),
    ...functions.map(f => ({ source: f.id, target: f.file, type: "imports" as const })),
    ...interfaces.map(i => ({ source: i.id, target: i.file, type: "imports" as const })),
    { source: "bookHandler", target: "checkAvailability", type: "calls" as const },
    { source: "bookHandler", target: "createBooking", type: "calls" as const },
    { source: "bookHandler", target: "processPayment", type: "calls" as const },
    { source: "createBooking", target: "getSlots", type: "calls" as const },
    { source: "createBooking", target: "validateSlot", type: "calls" as const },
    { source: "checkAvailability", target: "getSlots", type: "calls" as const },
    { source: "updateBooking", target: "validateSlot", type: "calls" as const },
    { source: "webhookHandler", target: "updateBooking", type: "calls" as const },
    { source: "bookHandler", target: "BookingService", type: "calls" as const },
    { source: "createEventType", target: "EventManager", type: "calls" as const },
    { source: "BookingService", target: "CalendarSync", type: "calls" as const },
    { source: "BookingService", target: "IBooking", type: "implements" as const },
    { source: "EventManager", target: "IEvent", type: "implements" as const },
    { source: "booking.ts", target: "availability.ts", type: "imports" as const },
    { source: "booking.ts", target: "calendar.ts", type: "imports" as const },
    { source: "events.ts", target: "booking.ts", type: "imports" as const },
    { source: "book-api.ts", target: "booking.ts", type: "imports" as const },
    { source: "payments.ts", target: "booking.ts", type: "imports" as const },
  ];

  return { nodes, links };
};

interface CodeGraphProps {
  onNodeClick?: (node: Node) => void;
  codebaseId?: string;
}

export function CodeGraph({ onNodeClick, codebaseId }: CodeGraphProps) {
  const graphRef = useRef<any>();
  const { themeInfo } = useCodeTheme();
  const [mounted, setMounted] = useState(false);
  const [graphMode, setGraphMode] = useState<GraphMode>("3d-force");
  const isDark = themeInfo.isDark;

  useEffect(() => {
    setMounted(true);
  }, []);

  const graphData = generateGraphData(isDark ? "dark" : "light", codebaseId);

  useEffect(() => {
    if (graphRef.current && graphMode === "3d-force") {
      graphRef.current.cameraPosition({ z: 400 });
      
      const rotateInterval = setInterval(() => {
        const angle = (Date.now() / 100) % 360;
        if (graphRef.current && graphMode === "3d-force") {
          graphRef.current.cameraPosition({
            x: 400 * Math.sin(angle * Math.PI / 180),
            z: 400 * Math.cos(angle * Math.PI / 180),
          });
        }
      }, 100);

      return () => clearInterval(rotateInterval);
    }
  }, [mounted, graphMode]);

  if (!mounted) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  const colorMap = getColorMap(isDark);

  return (
    <div className="w-full h-full relative">
      <GraphToolbar mode={graphMode} onModeChange={setGraphMode} />
      
      {graphMode === "3d-force" && (
        <ForceGraph3D
          ref={graphRef}
          graphData={graphData}
          nodeLabel={(node: any) => `
            <div style="
              background: ${isDark ? 'rgba(32, 32, 32, 0.95)' : 'rgba(255, 255, 255, 0.95)'};
              color: ${isDark ? '#e0e0e0' : '#37352F'};
              padding: 8px 12px;
              border-radius: 6px;
              border: 1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'};
              font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif;
              font-size: 12px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            ">
              <div style="font-weight: 500; margin-bottom: 2px;">${node.name}</div>
              <div style="color: ${isDark ? '#888' : '#6B6B6B'}; font-size: 11px;">
                ${node.type}
              </div>
            </div>
          `}
          nodeColor={(node: any) => node.color}
          nodeVal={(node: any) => node.val * 0.6}
          nodeOpacity={0.9}
          linkColor={() => isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}
          linkWidth={0.5}
          linkOpacity={0.6}
          backgroundColor={isDark ? "#141414" : "#ffffff"}
          onNodeClick={(node: any) => {
            if (onNodeClick) {
              onNodeClick(node);
            }
          }}
        />
      )}

      {graphMode === "2d-force" && (
        <ForceGraph2DView graphData={graphData} onNodeClick={onNodeClick} />
      )}

      {graphMode === "tree" && (
        <TreeGraphView graphData={graphData} onNodeClick={onNodeClick} />
      )}

      {graphMode === "radial" && (
        <RadialGraphView graphData={graphData} onNodeClick={onNodeClick} />
      )}
      
      {/* Legend - Notion style */}
      <div className="absolute top-4 left-4 bg-background border border-border rounded-lg p-3 text-xs space-y-1.5 shadow-sm">
        <div className="font-medium text-foreground mb-2">Structure</div>
        {[
          { label: "Packages", color: colorMap.package },
          { label: "Files", color: colorMap.file },
          { label: "Classes", color: colorMap.class },
          { label: "Functions", color: colorMap.function },
          { label: "Interfaces", color: colorMap.interface },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: item.color }} />
            <span className="text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Instructions - Notion style */}
      <div className="absolute bottom-4 right-4 bg-background border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground shadow-sm">
        Drag to rotate · Scroll to zoom · Click to explore
      </div>
    </div>
  );
}