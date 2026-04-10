import type { Match } from "../lib/types";
import { useMemo, useState } from "react";

function pctLabel(pct: number) {
  if (!Number.isFinite(pct)) return "0%";
  const rounded = Math.round(pct);
  return `${rounded}%`;
}

function moreLabel(sharedCount: number, shown: number) {
  const more = sharedCount - shown;
  if (more <= 0) return "";
  return ` +${more} more`;
}

export function MatchPanel({
  myNickname,
  myTag,
  matches,
  loading,
  error,
  onEditNickname,
  onCopyTag,
  onClose,
  onClearBands,
  onDeleteProfile
}: {
  myNickname: string;
  myTag: string | null;
  matches: Match[];
  loading: boolean;
  error: string | null;
  onEditNickname: () => void;
  onCopyTag: () => void;
  onClose?: () => void;
  onClearBands: () => void;
  onDeleteProfile: () => void;
}) {
  const top = matches.slice(0, 20);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const byKey = useMemo(() => new Map(top.map((m) => [m.key, m])), [top]);
  const expanded = expandedKey ? byKey.get(expandedKey) ?? null : null;

  return (
    <div className="panel">
      <div className="panelHeader">
        <h2 className="panelTitle">Your matches</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {onClose ? (
            <button type="button" className="pillButton" onClick={onClose} title="Back to bands">
              Back
            </button>
          ) : null}
          <button type="button" className="pillButton" onClick={onEditNickname} title="Edit nickname">
            {myNickname}
            {myTag ? ` · ${myTag}` : ""}
          </button>
          <button type="button" className="pillButton" onClick={onCopyTag} title="Copy your name + tag">
            Copy
          </button>
        </div>
      </div>
      <div className="panelBody">
        {error ? <div className="hint" style={{ color: "rgba(251,113,133,0.95)" }}>{error}</div> : null}
        {loading ? <div className="hint">Updating…</div> : null}

        {top.length === 0 ? (
          <div className="hint" style={{ marginTop: 6 }}>
            No matches yet. Pick a few bands, then check back here.
          </div>
        ) : (
          <div className="matchList" style={{ marginTop: 8 }}>
            {top.map((m) => (
              <button
                key={m.key}
                type="button"
                className={`matchCard matchCardButton ${expandedKey === m.key ? "matchCardExpanded" : ""}`}
                onClick={() => setExpandedKey((prev) => (prev === m.key ? null : m.key))}
                aria-expanded={expandedKey === m.key}
              >
                <div className="matchTop">
                  <div className="matchName">
                    {m.nickname} · {m.key.slice(0, 4).toUpperCase()}
                  </div>
                  <div className="matchPct">{pctLabel(m.matchPct)}</div>
                </div>
                <div className="matchMeta">
                  {m.sharedCount} shared band{m.sharedCount === 1 ? "" : "s"}
                  {m.sharedBands && m.sharedBands.length ? (
                    expandedKey === m.key ? (
                      <>
                        <div className="sharedBandsFull">{m.sharedBands.join(", ")}</div>
                      </>
                    ) : (
                      <>
                        {" "}
                        • {m.sharedBands.slice(0, 5).join(", ")}
                        {moreLabel(m.sharedCount, Math.min(5, m.sharedBands.length))}
                      </>
                    )
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="divider" />

        <div className="smallRow">
          <button type="button" className="pillButton" onClick={onClearBands}>
            Clear bands
          </button>
          <button type="button" className="pillButton dangerButton" onClick={onDeleteProfile}>
            Delete me
          </button>
        </div>

        <div style={{ height: 10 }} />
        <div className="hint">
          Profiles won’t be auto-deleted before the festival. After the festival, inactive profiles are pruned automatically.
        </div>
      </div>
    </div>
  );
}
