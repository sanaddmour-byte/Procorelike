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

  const activeChips = [
    ...(searchValue ? [{ key: "__search", label: `“${searchValue}”`, clear: () => onSearchChange("") }] : []),
    ...filters.flatMap((f) => {
      const v = activeFilters[f.key];
      if (!v) return [];
      const opt = f.options.find((o) => o.value === v);
      return [{ key: f.key, label: `${f.label}: ${opt?.label ?? v}`, clear: () => onFilterChange(f.key, "") }];
    }),
  ];

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={searchPlaceholder}
        className="min-w-[180px] flex-1 rounded-lg border-3 border-ink px-3 text-base"
        aria-label={searchPlaceholder}
      />
      {filters.map((filter) => (
        <select
          key={filter.key}
          value={activeFilters[filter.key] ?? ""}
          onChange={(e) => onFilterChange(filter.key, e.target.value)}
          className="rounded-lg border-3 border-ink px-2 text-base"
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
        <ul className="flex w-full flex-wrap items-center gap-2" aria-label="Active filters">
          {activeChips.map((chip) => (
            <li key={chip.key}>
              <button type="button" onClick={chip.clear} className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-navy-900 px-3 text-sm font-semibold text-white">
                {chip.label}
                <span aria-hidden="true">✕</span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={onClearAll} className="whitespace-nowrap px-2 text-sm font-semibold text-maroon-700 underline">
              {clearAllLabel}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
