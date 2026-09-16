export const PHONE_STATUS_BAR_HEIGHT = 38;
export const DYNAMIC_ISLAND_COMPACT_HEIGHT = 60;
export const DYNAMIC_ISLAND_REGULAR_HEIGHT = 66;
export const PHONE_SHELL_CONTENT_GAP = 8;

export function getPhoneIslandTopOffset(chromeStyle: string, compact: boolean) {
  return chromeStyle === 'neumorphic-v1' ? 5 : compact ? 4 : 10;
}

export function getPhoneShellTopPadding({
  safeTop,
  compact,
  chromeStyle,
  dynamicIslandVisible,
}: {
  safeTop: number;
  compact: boolean;
  chromeStyle: string;
  dynamicIslandVisible: boolean;
}) {
  if (!dynamicIslandVisible) {
    return Math.max(
      safeTop + PHONE_STATUS_BAR_HEIGHT + PHONE_SHELL_CONTENT_GAP,
      compact ? 52 : 58,
    );
  }

  const islandHeight = compact
    ? DYNAMIC_ISLAND_COMPACT_HEIGHT
    : DYNAMIC_ISLAND_REGULAR_HEIGHT;

  return safeTop
    + getPhoneIslandTopOffset(chromeStyle, compact)
    + islandHeight
    + PHONE_SHELL_CONTENT_GAP;
}

export function getPhoneShellBottomPadding(safeBottom: number) {
  return Math.max(safeBottom, 8);
}
