"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PRESET_STORAGE_KEY } from "@/lib/teams";

type Preset = "today" | "yesterday" | "last-week" | "last-month" | "custom";

interface DateFilterBarProps {
  preset: Preset;
  customFrom: string;
  customTo: string;
  allowRestore?: boolean;
}

export function DateFilterBar({
  preset,
  customFrom,
  customTo,
  allowRestore = false
}: DateFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [selectedPreset, setSelectedPreset] = useState<Preset>(preset);
  const [from, setFrom] = useState(customFrom);
  const [to, setTo] = useState(customTo);

  useEffect(() => {
    setSelectedPreset(preset);
    setFrom(customFrom);
    setTo(customTo);
  }, [preset, customFrom, customTo]);

  useEffect(() => {
    if (!allowRestore) return;
    const saved = window.localStorage.getItem(PRESET_STORAGE_KEY) as Preset | null;
    if (!saved || saved === "today" || saved === "custom") return;
    router.replace(`${pathname}?preset=${encodeURIComponent(saved)}`);
  }, [allowRestore, pathname, router]);

  function navigateWithPreset(value: Preset) {
    window.localStorage.setItem(PRESET_STORAGE_KEY, value);
    if (value === "today") {
      router.push(pathname);
      return;
    }
    if (value === "custom") {
      return;
    }
    router.push(`${pathname}?preset=${encodeURIComponent(value)}`);
  }

  function applyCustomRange() {
    if (!from || !to) return;
    window.localStorage.setItem(PRESET_STORAGE_KEY, "custom");
    router.push(
      `${pathname}?preset=custom&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );
  }

  return (
    <div className="filter-group">
      <div className="field-group">
        <label className="field-label">Date</label>
        <select
          className="field-control"
          value={selectedPreset}
          onChange={(event) => {
            const value = event.target.value as Preset;
            setSelectedPreset(value);
            navigateWithPreset(value);
          }}
        >
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="last-week">Last Week</option>
          <option value="last-month">Last Month</option>
          <option value="custom">Custom</option>
        </select>
      </div>

      {selectedPreset === "custom" ? (
        <>
          <div className="field-group">
            <label className="field-label">From</label>
            <input
              className="field-control"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="field-group">
            <label className="field-label">To</label>
            <input
              className="field-control"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <button className="apply-button" type="button" onClick={applyCustomRange}>
            Apply
          </button>
        </>
      ) : null}
    </div>
  );
}
