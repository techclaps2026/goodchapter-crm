"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

// Password input with a show/hide toggle. Spreads through all the usual input
// props (value, onChange, placeholder, required, className) so it's a
// drop-in for a plain <input type="password">.
export function PasswordInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        className={cn(className, "pr-10")}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
