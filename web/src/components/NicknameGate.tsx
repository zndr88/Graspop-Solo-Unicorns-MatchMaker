import { useMemo, useState } from "react";

export function NicknameGate({
  initialNickname,
  onSave
}: {
  initialNickname: string;
  onSave: (nickname: string) => void;
}) {
  const [nickname, setNickname] = useState(initialNickname);

  const isValid = useMemo(() => nickname.trim().length >= 2, [nickname]);

  return (
    <div className="panel">
      <div className="panelHeader">
        <h2 className="panelTitle">Quick intro</h2>
      </div>
      <div className="panelBody">
        <p className="subtitle" style={{ marginTop: 0 }}>
          Pick a nickname so people in the WhatsApp group recognize you. No accounts, no email.
        </p>

        <input
          className="search"
          style={{ borderRadius: 14 }}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="Nickname (e.g., Alex / MetalDad / SoloRider)"
          autoFocus
          maxLength={24}
        />

        <div style={{ height: 12 }} />

        <button
          type="button"
          className={`pillButton ${isValid ? "okButton" : ""}`}
          onClick={() => onSave(nickname.trim())}
          disabled={!isValid}
          style={{ width: "100%" }}
        >
          Continue
        </button>

        <div style={{ height: 10 }} />
        <div className="hint">
          Tip: you can edit this later. Your device is identified anonymously (UUID in localStorage).
        </div>
      </div>
    </div>
  );
}

