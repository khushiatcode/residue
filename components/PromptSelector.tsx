'use client';

import { useState } from 'react';

const PRESET_PROMPTS = [
  'describe your day',
  'something you\'re avoiding',
  'right now, honestly',
];

interface PromptSelectorProps {
  selected: string;
  onSelect: (prompt: string) => void;
}

export default function PromptSelector({ selected, onSelect }: PromptSelectorProps) {
  const [customValue, setCustomValue] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const handleCustomSubmit = () => {
    if (customValue.trim()) {
      onSelect(customValue.trim());
    }
  };

  const isCustomActive = showCustom || (!PRESET_PROMPTS.includes(selected) && selected !== '');

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        paddingLeft: 48,
        paddingRight: 48,
        paddingBottom: 8,
        flexWrap: 'wrap',
      }}
    >
      {PRESET_PROMPTS.map(prompt => {
        const isSelected = selected === prompt;
        return (
          <button
            key={prompt}
            onClick={() => { onSelect(prompt); setShowCustom(false); }}
            style={{
              fontFamily: '"Fragment Mono", monospace',
              fontSize: 10,
              color: isSelected ? 'var(--mist)' : 'var(--ghost)',
              background: isSelected ? 'var(--ghost)' : 'none',
              border: isSelected ? '1px solid var(--mist)' : '1px solid transparent',
              borderRadius: 0,
              padding: '4px 10px',
              cursor: 'pointer',
              letterSpacing: '0.05em',
              transition: 'color 0.2s, border-color 0.2s, background 0.2s',
              outline: 'none',
            }}
          >
            {prompt}
          </button>
        );
      })}

      {/* Custom prompt option */}
      {!isCustomActive ? (
        <button
          onClick={() => { setShowCustom(true); }}
          style={{
            fontFamily: '"Fragment Mono", monospace',
            fontSize: 10,
            color: 'var(--ghost)',
            background: 'none',
            border: '1px solid transparent',
            borderRadius: 0,
            padding: '4px 10px',
            cursor: 'pointer',
            letterSpacing: '0.05em',
            transition: 'color 0.2s',
            outline: 'none',
          }}
        >
          write your own...
        </button>
      ) : (
        <input
          autoFocus
          type="text"
          value={customValue}
          onChange={e => { setCustomValue(e.target.value); onSelect(e.target.value); }}
          onKeyDown={e => {
            if (e.key === 'Enter') { handleCustomSubmit(); (e.target as HTMLInputElement).blur(); }
            if (e.key === 'Escape') { setShowCustom(false); setCustomValue(''); }
          }}
          onBlur={() => {
            if (!customValue.trim()) { setShowCustom(false); }
          }}
          placeholder="write your prompt..."
          style={{
            fontFamily: '"Fragment Mono", monospace',
            fontSize: 10,
            color: 'var(--mist)',
            background: 'none',
            border: 'none',
            borderBottom: '1px solid rgba(232,232,240,0.3)',
            outline: 'none',
            padding: '4px 2px',
            letterSpacing: '0.05em',
            width: 180,
          }}
        />
      )}
    </div>
  );
}
