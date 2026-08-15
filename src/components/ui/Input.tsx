import React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`glass px-4 py-2 rounded-xl text-[var(--foreground)] placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-[var(--primary)]/50 transition-all ${className}`}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";