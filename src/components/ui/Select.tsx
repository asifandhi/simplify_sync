import React from "react";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = "", children, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={`glass px-4 py-2 pr-10 rounded-xl text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--primary)]/50 transition-all appearance-none cursor-pointer w-full ${className}`}
          {...props}
        >
          {children}
        </select>
        {/* Custom Dropdown Chevron */}
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    );
  }
);
Select.displayName = "Select";