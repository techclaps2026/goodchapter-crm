"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { ChevronDown, Check } from "lucide-react";

interface SelectOption {
  value: string;
  label: string;
  style?: React.CSSProperties;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
  placeholder?: string;
}

export default function Select({
  value,
  onChange,
  options,
  className,
  placeholder,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  function updatePosition() {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }

  // Keep the portaled menu aligned while open (scroll/resize).
  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onMove = () => updatePosition();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  // Close on outside click — the menu lives in a portal, so check both refs.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t))
        return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!open) updatePosition();
          setOpen((prev) => !prev);
        }}
        className="flex w-full items-center justify-between rounded-app border border-input bg-background pl-3 pr-3 py-2 text-sm text-left transition-colors hover:bg-muted/50"
      >
        <span
          className={cn(
            "min-w-0 truncate",
            selected ? "text-foreground" : "text-muted-foreground",
          )}
          style={selected?.style}
        >
          {selected?.label || placeholder || "Select..."}
        </span>
        <ChevronDown
          className={cn(
            "ml-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              minWidth: pos.width,
              maxWidth: "calc(100vw - 1rem)",
              zIndex: 60,
            }}
            className="max-h-64 overflow-y-auto rounded-card border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95 duration-100"
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left whitespace-nowrap transition-colors",
                  option.value === value
                    ? "bg-primary/10 text-primary"
                    : "text-popover-foreground hover:bg-muted",
                )}
                style={option.style}
              >
                <Check
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    option.value === value ? "opacity-100" : "opacity-0",
                  )}
                />
                <span>{option.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
