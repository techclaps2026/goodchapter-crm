import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The single source of truth for text-input styling. Replaces the `inputClass`
 * const that was copy-pasted into a dozen page files.
 */
const inputClassName =
  "w-full rounded-app border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(inputClassName, className)}
      {...props}
    />
  );
}

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(inputClassName, "min-h-20 resize-y", className)}
      {...props}
    />
  );
}

export { Input, Textarea, inputClassName };
