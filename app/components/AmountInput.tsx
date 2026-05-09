import './AmountInput.css';
import { useEffect, useRef, useState } from 'react';
import { useFormat } from '~/hooks/useFormat';

interface Props {
  decimals: number;
  // Controlled
  value?: string;
  onChange?: (raw: string) => void;
  // Uncontrolled / form submission
  name?: string;
  defaultValue?: string;
  // Common
  disabled?: boolean;
  required?: boolean;
  className?: string;
  id?: string;
}

function parseCents(raw: string | undefined, d: number): number | null {
  if (!raw) return null;
  const n = parseFloat(raw);
  return isFinite(n) ? Math.round(n * 10 ** d) : null;
}

function rawFromCents(c: number, d: number): string {
  return (c / 10 ** d).toFixed(d);
}

function displayFromCents(c: number | null, d: number, locale: string): string {
  if (c === null) return '';
  return (c / 10 ** d).toLocaleString(locale, {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

export function AmountInput({
  decimals,
  value,
  onChange,
  name,
  defaultValue,
  disabled,
  required,
  className,
  id,
}: Props) {
  const { locale } = useFormat();
  const isControlled = value !== undefined;

  const [cents, setCents] = useState<number | null>(() =>
    parseCents(isControlled ? value : defaultValue, decimals),
  );
  const pendingClear = useRef(false);
  const focused = useRef(false);

  // Sync controlled value → cents when not focused
  useEffect(() => {
    if (isControlled && !focused.current) {
      setCents(parseCents(value, decimals));
    }
  }, [value, decimals, isControlled]);

  const display = displayFromCents(cents, decimals, locale);
  const rawValue = cents !== null ? rawFromCents(cents, decimals) : '';

  const handleFocus = () => {
    focused.current = true;
    pendingClear.current = cents !== null; // next digit press replaces existing value
  };

  const handleBlur = () => {
    focused.current = false;
    pendingClear.current = false;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (['Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Escape'].includes(e.key)) return;

    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      const digit = parseInt(e.key, 10);
      let newCents: number;
      if (pendingClear.current) {
        pendingClear.current = false;
        newCents = digit;
      } else {
        newCents = (cents ?? 0) * 10 + digit;
      }
      setCents(newCents);
      onChange?.(rawFromCents(newCents, decimals));
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      if (pendingClear.current) {
        pendingClear.current = false;
        setCents(null);
        onChange?.('');
      } else if (cents === null || cents === 0) {
        setCents(null);
        onChange?.('');
      } else {
        const newCents = Math.floor(cents / 10);
        setCents(newCents);
        onChange?.(rawFromCents(newCents, decimals));
      }
    } else {
      e.preventDefault();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text').trim();
    const normalized = text.replace(/[^\d.,]/g, '').replace(',', '.');
    const n = parseFloat(normalized);
    if (isFinite(n) && n >= 0) {
      const newCents = Math.round(n * 10 ** decimals);
      setCents(newCents);
      onChange?.(rawFromCents(newCents, decimals));
    }
  };

  const cls = ['amount-input', className].filter(Boolean).join(' ');

  return (
    <>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        className={cls}
        value={display}
        disabled={disabled}
        required={required}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onChange={() => {}}
      />
      {name && <input type="hidden" name={name} value={rawValue} />}
    </>
  );
}
