"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Responsive breakpoints
const BREAKPOINTS = {
  mobile: "640px",
  tablet: "1024px",
  desktop: "1280px",
  wide: "1536px",
};

// Device detection utilities
export const useDeviceDetection = () => {
  const [device, setDevice] = useState({
    isMobile: false,
    isTablet: false,
    isDesktop: false,
    isWide: false,
    orientation: "portrait" as "portrait" | "landscape",
    touchSupported: false,
    hoverSupported: false,
  });

  useEffect(() => {
    const updateDevice = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      setDevice({
        isMobile: width < 640,
        isTablet: width >= 640 && width < 1024,
        isDesktop: width >= 1024 && width < 1536,
        isWide: width >= 1536,
        orientation: width > height ? "landscape" : "portrait",
        touchSupported:
          "ontouchstart" in window || navigator.maxTouchPoints > 0,
        hoverSupported: window.matchMedia("(hover: hover)").matches,
      });
    };

    updateDevice();
    window.addEventListener("resize", updateDevice);
    window.addEventListener("orientationchange", updateDevice);

    return () => {
      window.removeEventListener("resize", updateDevice);
      window.removeEventListener("orientationchange", updateDevice);
    };
  }, []);

  return device;
};

// Responsive context
const ResponsiveContext = createContext<ReturnType<
  typeof useDeviceDetection
> | null>(null);

export const ResponsiveProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const device = useDeviceDetection();

  return (
    <ResponsiveContext.Provider value={device}>
      {children}
    </ResponsiveContext.Provider>
  );
};

export const useResponsive = () => {
  const context = useContext(ResponsiveContext);
  if (!context) {
    throw new Error("useResponsive must be used within ResponsiveProvider");
  }
  return context;
};

// Smart responsive components
export interface ResponsiveContainerProps {
  children: React.ReactNode;
  className?: string;
  mobile?: React.ReactNode;
  tablet?: React.ReactNode;
  desktop?: React.ReactNode;
  wide?: React.ReactNode;
}

export const ResponsiveContainer = ({
  children,
  className,
  mobile,
  tablet,
  desktop,
  wide,
}: ResponsiveContainerProps) => {
  const { isMobile, isTablet, isDesktop, isWide } = useResponsive();

  const renderContent = () => {
    if (isWide && wide) return wide;
    if (isDesktop && desktop) return desktop;
    if (isTablet && tablet) return tablet;
    if (isMobile && mobile) return mobile;
    return children;
  };

  return <div className={cn("w-full", className)}>{renderContent()}</div>;
};

// Adaptive grid system
export interface AdaptiveGridProps {
  children: React.ReactNode;
  className?: string;
  cols?: {
    mobile?: number;
    tablet?: number;
    desktop?: number;
    wide?: number;
  };
  gap?: {
    mobile?: string;
    tablet?: string;
    desktop?: string;
    wide?: string;
  };
}

export const AdaptiveGrid = ({
  children,
  className,
  cols = { mobile: 1, tablet: 2, desktop: 3, wide: 4 },
  gap = { mobile: "gap-4", tablet: "gap-6", desktop: "gap-8", wide: "gap-10" },
}: AdaptiveGridProps) => {
  const { isMobile, isTablet, isDesktop, isWide } = useResponsive();

  const getGridClass = () => {
    if (isWide) return `grid-cols-${cols.wide || 4} ${gap.wide || "gap-10"}`;
    if (isDesktop)
      return `grid-cols-${cols.desktop || 3} ${gap.desktop || "gap-8"}`;
    if (isTablet)
      return `grid-cols-${cols.tablet || 2} ${gap.tablet || "gap-6"}`;
    return `grid-cols-${cols.mobile || 1} ${gap.mobile || "gap-4"}`;
  };

  return (
    <div className={cn("grid", getGridClass(), className)}>{children}</div>
  );
};

// Smart card component with responsive behavior
export interface SmartCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  press?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "default" | "elevated" | "outlined";
  onClick?: () => void;
}

export const SmartCard = ({
  children,
  className,
  hover = true,
  press = true,
  size = "md",
  variant = "default",
  onClick,
}: SmartCardProps) => {
  const { touchSupported, hoverSupported } = useResponsive();

  const getSizeClasses = () => {
    switch (size) {
      case "sm":
        return "p-3 rounded-lg";
      case "lg":
        return "p-6 rounded-xl";
      case "xl":
        return "p-8 rounded-2xl";
      default:
        return "p-4 rounded-xl";
    }
  };

  const getVariantClasses = () => {
    switch (variant) {
      case "elevated":
        return "bg-white shadow-lg border-0";
      case "outlined":
        return "bg-white border border-gray-200 shadow-sm";
      default:
        return "bg-white shadow-md border border-gray-100";
    }
  };

  const getInteractionClasses = () => {
    const classes = [];

    if (hoverSupported && hover) {
      classes.push(
        "hover:shadow-xl",
        "hover:scale-[1.02]",
        "transition-all",
        "duration-200",
      );
    }

    if (touchSupported && press && onClick) {
      classes.push("active:scale-[0.98]", "active:shadow-sm");
    }

    if (onClick) {
      classes.push("cursor-pointer");
    }

    return classes.join(" ");
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden",
        getSizeClasses(),
        getVariantClasses(),
        getInteractionClasses(),
        className,
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

// Responsive navigation with smart behavior
export interface SmartNavProps {
  items: Array<{
    id: string;
    label: string;
    icon?: React.ReactNode;
    badge?: string | number;
    onClick: () => void;
  }>;
  className?: string;
  variant?: "bottom" | "top" | "sidebar";
  activeId?: string;
}

export const SmartNav = ({
  items,
  className,
  variant = "bottom",
  activeId,
}: SmartNavProps) => {
  const { isMobile, isTablet } = useResponsive();

  const getLayoutClasses = () => {
    switch (variant) {
      case "sidebar":
        return isMobile ? "flex-row" : "flex-col";
      case "top":
        return "flex-row";
      default:
        return "flex-row";
    }
  };

  const getNavClasses = () => {
    const base = "flex items-center justify-between w-full";

    if (variant === "bottom") {
      return `${base} fixed bottom-0 left-0 right-0 bg-[var(--s0)] border-t border-[var(--b1)] z-50`;
    }

    if (variant === "top") {
      return `${base} bg-[var(--s0)] border-b border-[var(--b1)] sticky top-0 z-40`;
    }

    return `${base} bg-[var(--s0)] border-r border-[var(--b1)] h-full`;
  };

  return (
    <nav className={cn(getNavClasses(), getLayoutClasses(), className)}>
      {items.map((item) => (
        <button
          key={item.id}
          onClick={item.onClick}
          className={cn(
            "relative flex flex-col items-center justify-center p-2 min-w-[60px] transition-colors",
            "hover:bg-gray-50 active:bg-gray-100",
            activeId === item.id && "text-blue-600",
            activeId !== item.id && "text-gray-600",
          )}
        >
          {item.icon && (
            <div className="relative">
              {item.icon}
              {item.badge && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                  {item.badge}
                </span>
              )}
            </div>
          )}
          <span
            className={cn(
              "text-xs mt-1",
              isMobile ? "text-xs" : isTablet ? "text-sm" : "text-sm",
            )}
          >
            {item.label}
          </span>
        </button>
      ))}
    </nav>
  );
};

// Responsive modal with smart positioning
export interface SmartModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  position?: "center" | "bottom" | "side";
}

export const SmartModal = ({
  isOpen,
  onClose,
  children,
  className,
  size = "md",
  position = "center",
}: SmartModalProps) => {
  const { isMobile, isTablet } = useResponsive();

  const getSizeClasses = () => {
    if (size === "full") return "w-full h-full";

    const sizes = {
      sm: isMobile ? "w-11/12 max-w-sm" : "w-sm max-w-sm",
      md: isMobile ? "w-11/12 max-w-md" : "w-md max-w-md",
      lg: isMobile ? "w-11/12 max-w-lg" : "w-lg max-w-lg",
      xl: isMobile ? "w-11/12 max-w-xl" : "w-xl max-w-xl",
    };

    return sizes[size] || sizes.md;
  };

  const getPositionClasses = () => {
    if (position === "bottom" && isMobile) {
      return "fixed bottom-0 left-0 right-0 rounded-t-2xl";
    }

    if (position === "side" && !isMobile) {
      return "fixed right-0 top-0 h-full w-full max-w-md rounded-l-2xl";
    }

    return "fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 rounded-2xl";
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div
        className={cn(
          "bg-white shadow-2xl",
          getSizeClasses(),
          getPositionClasses(),
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
};

// Responsive list with smart behavior
export interface SmartListProps {
  items: Array<{
    id: string;
    title: string;
    subtitle?: string;
    icon?: React.ReactNode;
    badge?: string | number;
    onClick?: () => void;
  }>;
  className?: string;
  variant?: "cards" | "list" | "compact";
  searchable?: boolean;
  filterable?: boolean;
}

export const SmartList = ({
  items,
  className,
  variant = "list",
  searchable = false,
  filterable = false,
}: SmartListProps) => {
  const { isMobile } = useResponsive();
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredItems, setFilteredItems] = useState(items);

  useEffect(() => {
    if (searchTerm) {
      setFilteredItems(
        items.filter(
          (item) =>
            item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.subtitle?.toLowerCase().includes(searchTerm.toLowerCase()),
        ),
      );
    } else {
      setFilteredItems(items);
    }
  }, [searchTerm, items]);

  const getItemClasses = () => {
    switch (variant) {
      case "cards":
        return "p-4 bg-white rounded-xl shadow-sm border border-gray-100";
      case "compact":
        return "p-2 border-b border-gray-100";
      default:
        return "p-4 border-b border-gray-100";
    }
  };

  return (
    <div className={cn("w-full", className)}>
      {searchable && (
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      <div
        className={cn(
          variant === "cards" ? "grid gap-4" : "divide-y divide-gray-100",
        )}
      >
        {filteredItems.map((item) => (
          <div
            key={item.id}
            onClick={item.onClick}
            className={cn(
              getItemClasses(),
              item.onClick &&
                "cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors",
            )}
          >
            <div className="flex items-center space-x-3">
              {item.icon && <div className="flex-shrink-0">{item.icon}</div>}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">
                  {item.title}
                </div>
                {item.subtitle && (
                  <div className="text-sm text-gray-500 truncate">
                    {item.subtitle}
                  </div>
                )}
              </div>
              {item.badge && (
                <div className="flex-shrink-0">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {item.badge}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Responsive data table with smart behavior
export interface SmartTableProps {
  columns: Array<{
    key: string;
    label: string;
    sortable?: boolean;
    width?: string;
  }>;
  data: Record<string, any>[];
  className?: string;
  sortable?: boolean;
  filterable?: boolean;
  paginated?: boolean;
  pageSize?: number;
}

export const SmartTable = ({
  columns,
  data,
  className,
  sortable = false,
  filterable = false,
  paginated = false,
  pageSize = 10,
}: SmartTableProps) => {
  const { isMobile, isTablet } = useResponsive();
  const [currentPage, setCurrentPage] = useState(0);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [filters, setFilters] = useState<Record<string, string>>({});

  const sortedData = React.useMemo(() => {
    if (!sortColumn || !sortable) return data;

    return [...data].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, sortColumn, sortDirection, sortable]);

  const filteredData = React.useMemo(() => {
    if (!filterable || Object.keys(filters).length === 0) return sortedData;

    return sortedData.filter((item) =>
      Object.entries(filters).every(([key, value]) => {
        if (!value) return true;
        return String(item[key]).toLowerCase().includes(value.toLowerCase());
      }),
    );
  }, [sortedData, filters, filterable]);

  const paginatedData = React.useMemo(() => {
    if (!paginated) return filteredData;

    const start = currentPage * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize, paginated]);

  const totalPages = Math.ceil(filteredData.length / pageSize);

  const handleSort = (column: string) => {
    if (!sortable) return;

    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Mobile card view
  if (isMobile) {
    return (
      <div className={cn("space-y-4", className)}>
        {paginatedData.map((row, index) => (
          <SmartCard key={index} variant="outlined">
            {columns.map((column) => (
              <div key={column.key} className="flex justify-between py-2">
                <span className="text-sm font-medium text-gray-600">
                  {column.label}
                </span>
                <span className="text-sm text-gray-900">{row[column.key]}</span>
              </div>
            ))}
          </SmartCard>
        ))}

        {paginated && totalPages > 1 && (
          <div className="flex justify-center space-x-2">
            <button
              onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
              className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50"
            >
              Previous
            </button>
            <span className="px-3 py-1 text-sm">
              {currentPage + 1} / {totalPages}
            </span>
            <button
              onClick={() =>
                setCurrentPage(Math.min(totalPages - 1, currentPage + 1))
              }
              disabled={currentPage === totalPages - 1}
              className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    );
  }

  // Desktop table view
  return (
    <div className={cn("w-full", className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {columns.map((column) => (
                <th
                  key={column.key}
                  onClick={() => handleSort(column.key)}
                  className={cn(
                    "px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider",
                    sortable &&
                      column.sortable &&
                      "cursor-pointer hover:bg-gray-100",
                    column.width && `w-${column.width}`,
                  )}
                >
                  <div className="flex items-center space-x-1">
                    <span>{column.label}</span>
                    {sortable &&
                      column.sortable &&
                      sortColumn === column.key && (
                        <span>{sortDirection === "asc" ? "↑" : "↓"}</span>
                      )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-[var(--s0)] divide-y divide-[var(--b1)]">
            {paginatedData.map((row, index) => (
              <tr key={index} className="hover:bg-[var(--s2)]">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className="px-4 py-3 text-sm text-gray-900"
                  >
                    {row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {paginated && totalPages > 1 && (
        <div className="flex justify-center space-x-2 mt-4">
          <button
            onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
            disabled={currentPage === 0}
            className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-3 py-1 text-sm">
            {currentPage + 1} / {totalPages}
          </span>
          <button
            onClick={() =>
              setCurrentPage(Math.min(totalPages - 1, currentPage + 1))
            }
            disabled={currentPage === totalPages - 1}
            className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};
