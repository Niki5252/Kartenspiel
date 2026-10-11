import { useState } from 'react';

interface Props {
  deckCount: number;
  onConfirm: (index: number) => void;
}

/** Interaktive Wahl der Schnittstelle; erst "Schneiden" bestätigt den Schnitt. */
export function CutPicker({ deckCount, onConfirm }: Props) {
  const min = 1;
  const max = deckCount - 1;
  const [index, setIndex] = useState(Math.round(deckCount / 2));
  const [sent, setSent] = useState(false);
  const topPercent = (index / deckCount) * 100;
  return (
    <div className="cut-picker">
      <p>Wähle, wo du das Deck abheben möchtest.</p>
      <div className="cut-picker__deck" aria-hidden="true">
        <div className="cut-picker__part cut-picker__part--top" style={{ width: `${topPercent}%` }}>
          {index}
        </div>
        <div className="cut-picker__part cut-picker__part--bottom" style={{ width: `${100 - topPercent}%` }}>
          {deckCount - index}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={index}
        onChange={(e) => setIndex(Number(e.target.value))}
        aria-label="Schnittstelle"
        className="cut-picker__range"
      />
      <button
        type="button"
        className="btn btn--primary btn--block"
        disabled={sent}
        onClick={() => {
          setSent(true);
          onConfirm(index);
        }}
      >
        Hier schneiden ({index} Karten abheben)
      </button>
    </div>
  );
}
