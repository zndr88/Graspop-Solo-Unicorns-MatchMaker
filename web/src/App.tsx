import { useEffect, useMemo, useRef, useState } from "react";
import lineup from "./data/lineup.json";
import type { LineupByDay, Match } from "./lib/types";
import { getMatches, upsertMe, deleteMe } from "./lib/api";
import {
  getNickname,
  getOrCreateUuid,
  setNickname,
  clearLocalIdentity,
  getSelectedBands,
  setSelectedBands
} from "./lib/storage";
import { NicknameGate } from "./components/NicknameGate";
import { DaySection } from "./components/DaySection";
import { MatchPanel } from "./components/MatchPanel";
import { Drawer } from "./components/Drawer";

const LINEUP = lineup as LineupByDay;

function defaultNicknameFromUuid(uuid: string) {
  const suffix = uuid.replace(/-/g, "").slice(-4).toUpperCase();
  return `Solo-${suffix}`;
}

function useIsDesktop() {
  const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 900px)").matches);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 900px)");
    const onChange = () => setDesktop(mql.matches);
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);
  return desktop;
}

export function App() {
  const id = useMemo(() => getOrCreateUuid(), []);

  const [nickname, setNicknameState] = useState(() => getNickname() ?? defaultNicknameFromUuid(id));
  const [needsNickname, setNeedsNickname] = useState(() => !(getNickname() ?? "").trim().length);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(getSelectedBands()));

  const [matches, setMatches] = useState<Match[]>([]);
  const [matchesOpen, setMatchesOpen] = useState(false);
  const isDesktop = useIsDesktop();

  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const debounceRef = useRef<number | null>(null);

  const allBandsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const day of Object.keys(LINEUP)) {
      for (const band of LINEUP[day] ?? []) map.set(band.id, band.name);
    }
    return map;
  }, []);

  const filteredLineup = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LINEUP;

    const out: LineupByDay = {};
    for (const day of Object.keys(LINEUP)) {
      const bands = (LINEUP[day] ?? []).filter((b) => b.name.toLowerCase().includes(q));
      if (bands.length) out[day] = bands;
    }
    return out;
  }, [query]);

  const selectedCount = selected.size;

  async function syncNow(nextSelected: Set<string>, nextNickname = nickname) {
    setSyncing(true);
    setSyncError(null);
    try {
      await upsertMe({
        id,
        nickname: nextNickname,
        selectedBands: Array.from(nextSelected)
      });
      const res = await getMatches(id);
      const withNames = res.matches.map((m) => ({
        ...m,
        sharedBands: (m.sharedBands ?? []).map((bandId) => allBandsById.get(bandId) ?? bandId)
      }));
      setMatches(withNames);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to sync";
      setSyncError(message);
    } finally {
      setSyncing(false);
    }
  }

  function scheduleSync(nextSelected: Set<string>, nextNickname?: string) {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      syncNow(nextSelected, nextNickname ?? nickname);
    }, 450);
  }

  function toggleBand(bandId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(bandId)) next.delete(bandId);
      else next.add(bandId);
      setSelectedBands(Array.from(next));
      scheduleSync(next);
      return next;
    });
  }

  async function handleSaveNickname(next: string) {
    setNickname(next);
    setNicknameState(next);
    setNeedsNickname(false);
    await syncNow(selected, next);
  }

  function clearBands() {
    setSelected(() => {
      const next = new Set<string>();
      setSelectedBands([]);
      scheduleSync(next);
      return next;
    });
  }

  async function deleteProfile() {
    try {
      setSyncError(null);
      await deleteMe(id);
      clearBands();
      clearLocalIdentity();
      setNicknameState("");
      setNeedsNickname(true);
      setMatches([]);
      setSyncError("Deleted. Reload to start fresh.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to delete";
      setSyncError(message);
    }
  }

  useEffect(() => {
    if (needsNickname) return;
    syncNow(selected).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsNickname]);

  const main = (
    <div>
      <div className="header">
        <div className="titleRow">
          <h1 className="title">Graspop Matchmaker</h1>
          {!isDesktop ? (
            <button type="button" className="pillButton" onClick={() => setMatchesOpen(true)}>
              Matches ({matches.length})
            </button>
          ) : null}
        </div>
        <p className="subtitle">
          Pick the bands you want to see. We’ll match you with others in the WhatsApp group based on overlap.
        </p>

        <div className="toolbar">
          <input
            className="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search bands…"
          />
          <div className="hint">Selected: {selectedCount}</div>
        </div>
      </div>

      {Object.keys(filteredLineup).length === 0 ? (
        <div className="hint">No bands found for “{query.trim()}”.</div>
      ) : (
        Object.keys(filteredLineup).map((day) => (
          <DaySection key={day} day={day} bands={filteredLineup[day]} selectedIds={selected} onToggle={toggleBand} />
        ))
      )}
    </div>
  );

  const panel = (
    <MatchPanel
      myNickname={nickname}
      matches={matches}
      loading={syncing}
      error={syncError}
      onEditNickname={() => setNeedsNickname(true)}
      onClearBands={clearBands}
      onDeleteProfile={deleteProfile}
    />
  );

  return (
    <div className="container">
      <div className="appShell">
        <div>
          {needsNickname ? (
            <NicknameGate initialNickname={nickname} onSave={handleSaveNickname} />
          ) : (
            main
          )}
        </div>

        {isDesktop ? (
          <div style={{ position: "sticky", top: 16 }}>{panel}</div>
        ) : (
          <Drawer open={matchesOpen} title="Matches" onClose={() => setMatchesOpen(false)}>
            <div style={{ padding: 12 }}>{panel}</div>
          </Drawer>
        )}
      </div>

      {!needsNickname && syncing ? <div className="toast">Syncing…</div> : null}
    </div>
  );
}
