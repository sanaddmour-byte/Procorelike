interface FilterDef {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

interface Props {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterDef[];
  activeFilters: Record<string, string>;
  onFilterChange: (key: string, value: string) => void;
  onClearAll: () => void;
  clearAllLabel?: string;
}

/**
 * A consistent search + filter toolbar for list pages. "Clear all" only
 * shows once something is actually set, so it isn't dead chrome on an
 * unfiltered list.
 */
export function FilterBar({ searchValue, onSearchChange, searchPlaceholder = "Search…", filters = [], activeFilters, onFilterChange, onClearAll, clearAllLabel = "Clear all" }: Props) {
  const hasActiveFilters = Boolean(searchValue) || Object.values(activeFilters).some(Boolean);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={searchPlaceholder}
        className="min-w-[180px] flex-1 rounded-lg border-3 border-ink px-3 py-1.5 text-sm"
        aria-label={searchPlaceholder}
      />
      {filters.map((filter) => (
        <select
          key={filter.key}
          value={activeFilters[filter.key] ?? ""}
          onChange={(e) => onFilterChange(filter.key, e.target.value)}
          className="rounded-lg border-3 border-ink px-2 py-1.5 text-sm"
          aria-label={filter.label}
        >
          <option value="">{filter.label}</option>
          {filter.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ))}
      {hasActiveFilters && (
        <button type="button" onClick={onClearAll} className="whitespace-nowrap text-sm font-semibold text-maroon-700 underline">
          {clearAllLabel}
        </button>
      )}
    </div>
  );
}
