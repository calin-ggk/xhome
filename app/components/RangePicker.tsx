import './RangePicker.css';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { REPORT_RANGE_OPTIONS, type ReportRange } from '~/schemas/preferences.schema';

interface Props {
  value: ReportRange;
  onChange: (range: ReportRange) => void;
}

function rangeSpan(range: ReportRange, todayMonth: number): number {
  switch (range) {
    case 'current_month':  return 1;
    case 'last_3_months':  return 3;
    case 'last_6_months':  return 6;
    case 'current_year':   return todayMonth;
    case 'last_12_months': return 12;
    case 'all':            return Infinity;
  }
}

export function RangePicker({ value, onChange }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const todayMonth = new Date().getMonth() + 1;
  const sorted = [...REPORT_RANGE_OPTIONS].sort(
    (a, b) => rangeSpan(a, todayMonth) - rangeSpan(b, todayMonth),
  );

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function select(range: ReportRange) {
    setOpen(false);
    onChange(range);
  }

  return (
    <div className="range-picker-wrapper" ref={wrapperRef}>
      <button
        type="button"
        className={`range-picker-trigger${open ? ' is-open' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        <span>{t(`preferences.range_${value}`)}</span>
        <span className="range-picker-caret">▾</span>
      </button>

      {open && (
        <div className="range-picker-panel">
          {sorted.map(range => (
            <button
              key={range}
              type="button"
              className={`range-picker-option${range === value ? ' is-selected' : ''}`}
              onClick={() => select(range)}
            >
              {t(`preferences.range_${range}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
