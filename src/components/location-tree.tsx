"use client";
import * as React from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, ChevronDown, FolderTree, Truck, Box, Package, Layers, Briefcase, GripVertical } from "lucide-react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export type LocationNode = {
  id: string;
  name: string;
  type: "STATION" | "VEHICLE" | "BOX" | "KIT" | "BAG" | "SHELF";
  itemCount?: number;
  children?: LocationNode[];
};

const iconFor = (t: LocationNode["type"]) => {
  switch (t) {
    case "STATION": return FolderTree;
    case "VEHICLE": return Truck;
    case "BOX": return Box;
    case "KIT": return Package;
    case "BAG": return Briefcase;
    case "SHELF": return Layers;
  }
};

// Drag-drop state shared across all nodes via a tiny context
type DragState = { draggingId: string | null; setDraggingId: (id: string | null) => void };
const DragCtx = React.createContext<DragState>({ draggingId: null, setDraggingId: () => {} });

export function LocationTree({ nodes }: { nodes: LocationNode[] }) {
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const qc = useQueryClient();

  const reparent = useMutation({
    mutationFn: ({ id, parentId }: { id: string; parentId: string | null }) =>
      api.patch(`/api/locations/${id}`, { parentId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["locations-tree"] });
      qc.invalidateQueries({ queryKey: ["location"] });
      toast.success("Moved.");
    },
    onError: (e) => toast.error(String(e)),
  });

  function onRootDrop(e: React.DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/location-id");
    if (id) reparent.mutate({ id, parentId: null });
    setDraggingId(null);
  }

  return (
    <DragCtx.Provider value={{ draggingId, setDraggingId }}>
      <div
        className="border rounded-xl p-2 bg-card"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onRootDrop}
      >
        <div className="px-3 py-1 text-xs text-muted-foreground">
          Drag a row onto another row to nest it. Drop here to move to top level.
        </div>
        <Children nodes={nodes} depth={0} onMove={(id, parentId) => reparent.mutate({ id, parentId })} />
      </div>
    </DragCtx.Provider>
  );
}

function Children({
  nodes,
  depth,
  onMove,
}: {
  nodes: LocationNode[];
  depth: number;
  onMove: (id: string, parentId: string | null) => void;
}) {
  return (
    <ul className="space-y-1">
      {nodes.map((n) => (
        <LocationNodeRow key={n.id} node={n} depth={depth} onMove={onMove} />
      ))}
    </ul>
  );
}

function LocationNodeRow({
  node,
  depth,
  onMove,
}: {
  node: LocationNode;
  depth: number;
  onMove: (id: string, parentId: string | null) => void;
}) {
  const [open, setOpen] = React.useState(depth < 1);
  const [over, setOver] = React.useState(false);
  const drag = React.useContext(DragCtx);
  const hasChildren = (node.children?.length ?? 0) > 0;
  const Icon = iconFor(node.type);

  return (
    <li>
      <div
        className={cn(
          "flex items-center gap-1 rounded-md hover:bg-accent transition-colors",
          over && drag.draggingId !== node.id && "bg-primary/15 ring-1 ring-primary",
          drag.draggingId === node.id && "opacity-50",
        )}
        style={{ paddingLeft: `${depth * 12}px` }}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/location-id", node.id);
          e.dataTransfer.effectAllowed = "move";
          drag.setDraggingId(node.id);
        }}
        onDragEnd={() => drag.setDraggingId(null)}
        onDragOver={(e) => {
          if (drag.draggingId && drag.draggingId !== node.id) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOver(false);
          const id = e.dataTransfer.getData("text/location-id");
          if (id && id !== node.id) onMove(id, node.id);
          drag.setDraggingId(null);
        }}
      >
        <span className="h-12 w-8 grid place-items-center text-muted-foreground cursor-grab active:cursor-grabbing shrink-0" aria-hidden>
          <GripVertical className="h-4 w-4" />
        </span>
        <button
          type="button"
          aria-label={open ? "Collapse" : "Expand"}
          onClick={() => setOpen((o) => !o)}
          className="h-12 w-12 grid place-items-center text-muted-foreground shrink-0 hover:bg-accent rounded-md"
          disabled={!hasChildren}
        >
          {hasChildren ? (
            open ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />
          ) : (
            <span className="h-5 w-5" />
          )}
        </button>
        <Link href={`/locations/${node.id}`} className="flex flex-1 items-center gap-2 py-3 pr-2 text-sm min-h-tap">
          <Icon className="h-4 w-4 text-primary" />
          <span className="font-medium">{node.name}</span>
          <span className="ml-auto text-xs text-muted-foreground">
            {node.itemCount != null ? `${node.itemCount} items` : ""}
          </span>
        </Link>
      </div>
      {open && hasChildren && (
        <div style={{ paddingLeft: `${(depth + 1) * 12}px` }}>
          <Children nodes={node.children!} depth={depth + 1} onMove={onMove} />
        </div>
      )}
    </li>
  );
}
