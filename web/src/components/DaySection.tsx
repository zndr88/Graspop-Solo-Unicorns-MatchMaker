import type { Band } from "../lib/types";
import { BandTile } from "./BandTile";

export function DaySection({
  day,
  bands,
  selectedIds,
  onToggle
}: {
  day: string;
  bands: Band[];
  selectedIds: Set<string>;
  onToggle: (bandId: string) => void;
}) {
  return (
    <section className="daySection">
      <h2 className="dayTitle">{day}</h2>
      <div className="grid">
        {bands.map((band) => (
          <BandTile
            key={band.id}
            band={band}
            selected={selectedIds.has(band.id)}
            onToggle={onToggle}
          />
        ))}
      </div>
    </section>
  );
}

