import type { Band } from "../lib/types";

export function BandTile({
  band,
  selected,
  onToggle
}: {
  band: Band;
  selected: boolean;
  onToggle: (bandId: string) => void;
}) {
  return (
    <button
      type="button"
      className={`bandTile ${selected ? "bandTileSelected" : ""}`}
      onClick={() => onToggle(band.id)}
      aria-pressed={selected}
    >
      <span className="bandName">{band.name}</span>
      <span className="check" aria-hidden="true">
        {selected ? "✓" : ""}
      </span>
    </button>
  );
}

