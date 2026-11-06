import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  dateKey,
  dateFromKey,
  monthDates,
  shiftDate,
  shiftMonth,
} from "./date-utils";

export function DatePicker({
  label,
  name,
  value,
  defaultValue = "",
  onChange,
  optional = false,
  trigger,
}: {
  label: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  optional?: boolean;
  trigger?: ReactNode;
}) {
  const today = dateKey(new Date());
  const [internal, setInternal] = useState(defaultValue);
  const selected = value ?? internal;
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(selected || today);
  const [focused, setFocused] = useState(selected || today);
  const root = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    if (open)
      root.current
        ?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)
        ?.focus();
  }, [open, focused, month]);
  function choose(key: string) {
    setInternal(key);
    onChange?.(key);
    setOpen(false);
    opener.current?.focus();
  }
  function browseMonth(offset: number) {
    const next = shiftMonth(month, offset);
    setMonth(next);
    setFocused(`${next.slice(0, 7)}-01`);
  }
  const monthDate = dateFromKey(month);
  return (
    <div
      className={`date-field ${trigger ? "date-field-compact" : ""}`}
      ref={root}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          opener.current?.focus();
        }
      }}
    >
      {!trigger && <span className="date-field-label">{label}</span>}
      {name && <input type="hidden" name={name} value={selected} />}
      <button
        ref={opener}
        type="button"
        className={trigger ? "month-picker" : "date-field-trigger"}
        aria-label={`${label}：${selected || "未选择"}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (!open) {
            setMonth(selected || today);
            setFocused(selected || today);
          }
          setOpen(!open);
        }}
      >
        {trigger || (
          <>
            <span>
              {selected
                ? `${dateFromKey(selected).getFullYear()}年${dateFromKey(selected).getMonth() + 1}月${dateFromKey(selected).getDate()}日`
                : "选择日期"}
            </span>
            <span aria-hidden="true">▦</span>
          </>
        )}
      </button>
      {open && (
        <div
          id={panelId}
          className="date-panel"
          role="group"
          aria-label={`${label}日历`}
        >
          <div className="date-panel-heading">
            <button
              type="button"
              aria-label="上个月"
              onClick={() => browseMonth(-1)}
            >
              ‹
            </button>
            <strong aria-live="polite">
              {monthDate.getFullYear()}年{monthDate.getMonth() + 1}月
            </strong>
            <button
              type="button"
              aria-label="下个月"
              onClick={() => browseMonth(1)}
            >
              ›
            </button>
          </div>
          <div className="date-panel-grid">
            {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
              <span className="date-panel-weekday" key={day}>
                {day}
              </span>
            ))}
            {monthDates(month).map((key) => (
              <button
                type="button"
                key={key}
                data-date={key}
                className={`${key.slice(0, 7) !== month.slice(0, 7) ? "outside-month" : ""} ${key === today ? "date-today" : ""}`}
                aria-label={`选择 ${key}`}
                aria-pressed={key === selected}
                tabIndex={key === focused ? 0 : -1}
                onFocus={() => setFocused(key)}
                onKeyDown={(event) => {
                  const shifts: Record<string, number> = {
                    ArrowLeft: -1,
                    ArrowRight: 1,
                    ArrowUp: -7,
                    ArrowDown: 7,
                  };
                  let next: string | undefined;
                  if (event.key in shifts)
                    next = shiftDate(key, shifts[event.key]);
                  if (event.key === "PageUp" || event.key === "PageDown")
                    next = shiftMonth(key, event.key === "PageUp" ? -1 : 1);
                  if (next) {
                    event.preventDefault();
                    setFocused(next);
                    setMonth(next);
                  }
                }}
                onClick={() => choose(key)}
              >
                {Number(key.slice(-2))}
              </button>
            ))}
          </div>
          <div className="date-panel-footer">
            {optional && (
              <button type="button" onClick={() => choose("")}>
                清除日期
              </button>
            )}
            <button type="button" onClick={() => choose(today)}>
              今天
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                opener.current?.focus();
              }}
            >
              收起
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
