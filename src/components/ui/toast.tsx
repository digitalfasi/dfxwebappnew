"use client";

import React, { useEffect } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToastProps {
  message: string;
  type?: "success" | "error";
  onClose: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = "success",
  onClose,
  duration = 3000,
}) => {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-sm font-semibold text-white animate-in slide-in-from-bottom-5 duration-200 min-w-[280px] max-w-md",
        type === "success" ? "bg-ink border border-gold/30" : "bg-danger"
      )}
    >
      {type === "success" ? (
        <CheckCircle2 className="h-5 w-5 text-gold shrink-0" />
      ) : (
        <AlertCircle className="h-5 w-5 text-white shrink-0" />
      )}
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="opacity-70 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};
