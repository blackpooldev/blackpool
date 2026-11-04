// Link-grid icons — designed in Figma ("Landing — parity" → Icons / link grid). 24-grid, 1.9 stroke, round caps.
const PATHS: Record<string, { d: string; dark?: boolean }> = {
  shield: { d: '<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/>' },
  send: { d: '<path d="M4 12h12"/><path d="M12 6l6 6-6 6"/><circle cx="4" cy="12" r="1.3" fill="currentColor" stroke="none"/>' },
  swap: { d: '<path d="M4 8h13"/><path d="M14 5l3 3-3 3"/><path d="M20 16H7"/><path d="M10 13l-3 3 3 3"/>' },
  intents: { d: '<circle cx="5" cy="12" r="2.2"/><circle cx="19" cy="12" r="2.2"/><path d="M7.2 12c3-6 6.6-6 9.6 0"/><path d="M7.2 12c3 6 6.6 6 9.6 0" opacity=".45"/>' },
  route: { d: '<rect x="3" y="4" width="6" height="6" rx="1.6"/><rect x="15" y="14" width="6" height="6" rx="1.6"/><path d="M9 7h5a3 3 0 0 1 3 3v4"/><path d="M15 12l2 2 2-2"/>' },
  recover: { d: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2"/><path d="M5.6 5.6l3.8 3.8M14.6 14.6l3.8 3.8M18.4 5.6l-3.8 3.8M9.4 14.6l-3.8 3.8"/>' },
  cli: { d: '<path d="M5 7l5 5-5 5"/><path d="M12 17h7"/>', dark: true },
  chart: { d: '<path d="M4 20V11"/><path d="M10 20V5"/><path d="M16 20v-6"/><path d="M3 20h18"/>' },
  pulse: { d: '<path d="M3 12h4l2.5-5.5 4.5 11 2.5-5.5H21"/>' },
  docs: { d: '<path d="M6 4h9l4 4v12H6z"/><path d="M15 4v4h4"/><path d="M9 13h7M9 16h7"/>' },
};

export default function Icon({ k, c, size = 22 }: { k: string; c: string; size?: number }) {
  const p = PATHS[k] || PATHS.docs;
  return (
    <i className="lp-ico" style={{ background: c, color: p.dark ? "#0B0C0E" : "#FFFFFF" }} aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: p.d }} />
    </i>
  );
}
