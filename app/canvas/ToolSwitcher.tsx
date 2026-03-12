"use client";

import { Brush, Move, Stamp } from "lucide-react";
import type { ActiveTool } from "./toolbar.types";

type ToolSwitcherProps = {
  activeTool: ActiveTool;
  onToolChange: (tool: ActiveTool) => void;
  canMove: boolean;
};

const TOOLS: { id: ActiveTool; label: string; icon: typeof Brush }[] = [
  { id: "paint", label: "Štětec", icon: Brush },
  { id: "stamp", label: "Razítko", icon: Stamp },
  { id: "move", label: "Přesun", icon: Move },
];

export function ToolSwitcher({ activeTool, onToolChange, canMove }: ToolSwitcherProps) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      {TOOLS.map(({ id, label, icon: Icon }) => {
        const isActive = activeTool === id;
        const disabled = id === "move" && !canMove;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onToolChange(id)}
            disabled={disabled}
            title={label}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-muted-foreground transition hover:text-foreground disabled:opacity-40 md:h-9 md:w-9 ${
              isActive
                ? "bg-primary/15 text-primary border-primary/30"
                : ""
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
