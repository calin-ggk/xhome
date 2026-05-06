import './MonthPicker.css';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';

interface Props {
  selectedMonth: number;
  selectedYear: number;
}

export function MonthPicker({ selectedMonth, selectedYear }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [displayYear, setDisplayYear] = useState(selectedYear);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const monthsShort = t('monthPicker.monthsShort', { returnObjects: true }) as string[];
  const monthsLong  = t('monthPicker.monthsLong',  { returnObjects: true }) as string[];

  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1;

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

  // Sync displayYear when picker opens or selected year changes
  useEffect(() => {
    setDisplayYear(selectedYear);
  }, [selectedYear, open]);

  function goTo(month: number, year: number) {
    setOpen(false);
    navigate(`?m=${month}&year=${year}`);
  }

  return (
    <div className="month-picker-wrapper" ref={wrapperRef}>
      <button
        type="button"
        className={`month-picker-trigger${open ? ' is-open' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        <span>{monthsLong[selectedMonth - 1]} {selectedYear}</span>
        <span className="month-picker-trigger-caret">▾</span>
      </button>

      {open && (
        <div className="month-picker-panel">
          <div className="month-picker-header">
            <button type="button" className="month-picker-nav" onClick={() => setDisplayYear(y => y - 1)}>
              &#8249;
            </button>
            <span className="month-picker-year">{displayYear}</span>
            <button type="button" className="month-picker-nav" onClick={() => setDisplayYear(y => y + 1)}>
              &#8250;
            </button>
          </div>

          <div className="month-picker-grid">
            {monthsShort.map((name, i) => {
              const month = i + 1;
              const isSelected = month === selectedMonth && displayYear === selectedYear;
              return (
                <button
                  key={month}
                  type="button"
                  className={`month-picker-cell${isSelected ? ' is-selected' : ''}`}
                  onClick={() => goTo(month, displayYear)}
                >
                  {name}
                </button>
              );
            })}
          </div>

          <div className="month-picker-footer">
            <button
              type="button"
              className="month-picker-today"
              onClick={() => { setDisplayYear(todayYear); goTo(todayMonth, todayYear); }}
            >
              {t('monthPicker.today')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
