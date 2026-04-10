import { useEffect } from "react";

export function Drawer({
  open,
  title,
  onClose,
  children
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="drawerOverlay" onClick={onClose} aria-hidden="true" />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawerHandle" />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "0 12px 8px" }}>
          <div style={{ color: "rgba(255,255,255,0.66)", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            {title}
          </div>
          <button type="button" className="pillButton" onClick={onClose} aria-label="Close matches">
            Close
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
