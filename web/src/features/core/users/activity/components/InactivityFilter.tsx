// Licensed to the Apache Software Foundation (ASF) under one
// or more contributor license agreements.  See the NOTICE file
// distributed with this work for additional information
// regarding copyright ownership.  The ASF licenses this file
// to you under the Apache License, Version 2.0 (the
// "License"); you may not use this file except in compliance
// with the License.  You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

"use client";

import { cn } from "@/lib/utils";
import { Input } from "@/shared/ui/input";
import * as React from "react";

type Mode = 3 | 7 | "custom";

type Props = {
  value: number;
  onChange: (days: number) => void;
};

const PRESETS: { label: string; mode: Mode }[] = [
  { label: "3 days", mode: 3 },
  { label: "7 days", mode: 7 },
  { label: "Custom", mode: "custom" },
];

/**
 * Button-group filter for selecting the inactivity threshold.
 * Presets: 3 days | 7 days | Custom (free-entry number input).
 *
 * Uses an explicit `mode` state (separate from `value`) so clicking
 * "Custom" immediately shows the input even before a new value is committed.
 */
export function InactivityFilter({ value, onChange }: Props) {
  // Derive the initial mode from the incoming value.
  const [mode, setMode] = React.useState<Mode>(() => {
    if (value === 3) return 3;
    if (value === 7) return 7;
    return "custom";
  });

  // Local draft while the user types in the custom input.
  const [customDraft, setCustomDraft] = React.useState<string>(String(value));
  const inputRef = React.useRef<HTMLInputElement>(null);

  function handlePreset(m: Mode) {
    setMode(m);
    if (m === "custom") {
      // Prefill with the current value so the user can see what they're editing.
      setCustomDraft(String(value));
      // Focus the input after it appears in the DOM.
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      onChange(m);
    }
  }

  function commitCustom(raw: string) {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 1 && n <= 3650) {
      onChange(n);
    } else {
      // Revert draft to the last committed value on invalid input.
      setCustomDraft(String(value));
    }
  }

  return (
    <fieldset className="flex items-center gap-2" aria-label="Inactivity threshold">
      <span className="text-xs text-muted-foreground whitespace-nowrap">Inactive for</span>

      {/* Preset button group */}
      <div className="flex rounded-md border border-border bg-muted/40 p-0.5 gap-0.5">
        {PRESETS.map(({ label, mode: m }) => (
          <button
            key={label}
            type="button"
            onClick={() => handlePreset(m)}
            aria-pressed={mode === m}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              mode === m
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Custom day input — only visible when mode is "custom" */}
      {mode === "custom" && (
        <div className="flex items-center gap-1">
          <Input
            ref={inputRef}
            type="number"
            min={1}
            max={3650}
            value={customDraft}
            onChange={(e) => setCustomDraft(e.target.value)}
            onBlur={(e) => commitCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitCustom((e.target as HTMLInputElement).value);
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="h-7 w-16 px-2 text-xs"
            aria-label="Custom inactivity days"
          />
          <span className="text-xs text-muted-foreground">days</span>
        </div>
      )}
    </fieldset>
  );
}
