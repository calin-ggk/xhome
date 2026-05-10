import './TagPicker.css';
import { useState, useEffect, useRef } from 'react';

interface TagOption {
  id: number;
  name: string;
}

interface Props {
  tags: TagOption[];
  value: number | null;
  allLabel: string;
  onChange: (tagId: number | null) => void;
}

export function TagPicker({ tags, value, allLabel, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

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

  function select(tagId: number | null) {
    setOpen(false);
    onChange(tagId);
  }

  return (
    <div className="tag-picker-wrapper" ref={wrapperRef}>
      <button
        type="button"
        className={`tag-picker-trigger${open ? ' is-open' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        <span>{tags.find(t => t.id === value)?.name ?? allLabel}</span>
        <span className="tag-picker-caret">▾</span>
      </button>
      {open && (
        <div className="tag-picker-panel">
          <button
            type="button"
            className={`tag-picker-option${value === null ? ' is-selected' : ''}`}
            onClick={() => select(null)}
          >
            {allLabel}
          </button>
          {tags.map(tag => (
            <button
              key={tag.id}
              type="button"
              className={`tag-picker-option${tag.id === value ? ' is-selected' : ''}`}
              onClick={() => select(tag.id)}
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
