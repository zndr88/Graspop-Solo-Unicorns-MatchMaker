import type { Match } from "../lib/types";

function pctLabel(pct: number) {
  if (!Number.isFinite(pct)) return "0%";
  const rounded = Math.round(pct);
  return `${rounded}%`;
}

export function MatchPanel({
  myNickname,
  matches,
  loading,
  error,
  onEditNickname,
  onClearBands,
  onDeleteProfile
}: {
  myNickname: string;
  matches: Match[];
  loading: boolean;
  error: string | null;
  onEditNickname: () => void;
  onClearBands: () => void;
  onDeleteProfile: () => void;
}) {
  const top = matches.slice(0, 20);

  return (
    <div className="panel">
      <div className="panelHeader">
        <h2 className="panelTitle">Your matches</h2>
        <button type="button" className="pillButton" onClick={onEditNickname}>
          {myNickname}
        </button>
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
              <div key={m.id} className="matchCard">
                <div className="matchTop">
                  <div className="matchName">{m.nickname}</div>
                  <div className="matchPct">{pctLabel(m.matchPct)}</div>
                </div>
                <div className="matchMeta">
                  {m.sharedCount} shared band{m.sharedCount === 1 ? "" : "s"}
                  {m.sharedBands && m.sharedBands.length ? (
                    <>
                      {" "}
                      • {m.sharedBands.join(", ")}
                    </>
                  ) : null}
                </div>
              </div>
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
          Data expires automatically after the festival window (TTL on the backend). Keep it casual.
        </div>
      </div>
    </div>
  );
}

