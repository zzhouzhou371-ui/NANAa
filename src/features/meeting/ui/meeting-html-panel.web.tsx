export interface MeetingHtmlPanelProps {
  srcDoc: string;
  height: number;
  accessibilityLabel: string;
}
export function MeetingHtmlPanel({ srcDoc, height, accessibilityLabel }: MeetingHtmlPanelProps) {
  const safeHeight = Math.max(44, Math.min(320, Math.round(height)));
  return (
    <iframe
      title={accessibilityLabel}
      aria-label={accessibilityLabel}
      srcDoc={srcDoc}
      sandbox=""
      allow=""
      referrerPolicy="no-referrer"
      loading="eager"
      tabIndex={-1}
      style={{
        display: 'block',
        width: '100%',
        height: safeHeight,
        border: 0,
        background: 'transparent',
        pointerEvents: 'none',
      }}
    />
  );
}
