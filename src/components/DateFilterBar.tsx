"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

interface DateFilterBarProps {
  currentPreset: string;
  from: string;
  to: string;
}

export function DateFilterBar({
  currentPreset,
  from,
  to
}: DateFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [selectedPreset, setSelectedPreset] = useState(currentPreset);
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  useEffect(() => {
    setSelectedPreset(currentPreset);
    setCustomFrom(from);
    setCustomTo(to);
  }, [currentPreset, from, to]);

  const isCustom = selectedPreset === "custom";
  const isFiltered = currentPreset !== "";

  function applyPreset(value: string) {
    if (value === "") {
      router.push(pathname);
      return;
    }

    if (value === "custom") {
      setSelectedPreset(value);
      return;
    }

    router.push(`${pathname}?preset=${encodeURIComponent(value)}`);
  }

  function applyCustomRange() {
    if (!customFrom || !customTo) return;
    router.push(
      `${pathname}?preset=custom&from=${encodeURIComponent(customFrom)}&to=${encodeURIComponent(customTo)}`
    );
  }

  return (
    <div className="range-toolbar">
      <div className="date-filter-group">
        <label className="toolbar-label">
          <span>Date</span>
          <select
            value={selectedPreset}
            className="toolbar-select"
            onChange={(event) => {
              const value = event.target.value;
              setSelectedPreset(value);
              applyPreset(value);
            }}
          >
            <option value="">Default</option>
            <option value="yesterday">Yesterday</option>
            <option value="last-week">Last Week</option>
            <option value="last-month">Last Month</option>
            <option value="custom">Custom Date</option>
          </select>
        </label>

        {isFiltered ? (
          <button
            type="button"
            className="reset-filter-button"
            aria-label="Reset date filter"
            onClick={() => router.push(pathname)}
          >
            ×
          </button>
        ) : null}
      </div>

      {isCustom ? (
        <div className="custom-range-form">
          <input
            type="date"
            value={customFrom}
            aria-label="Custom from date"
            onChange={(event) => setCustomFrom(event.target.value)}
          />
          <input
            type="date"
            value={customTo}
            aria-label="Custom to date"
            onChange={(event) => setCustomTo(event.target.value)}
          />
          <button
            type="button"
            className="button"
            onClick={applyCustomRange}
          >
            Apply
          </button>
        </div>
      ) : null}
    </div>
  );
}
