/**
 * Project-owned raster assets for the WeChat relationship world.
 * Keep requires static so Metro includes the files in native bundles.
 */
export const wechatAssets = {
  sharedMemoryCard: require('../../assets/generated/wechat-v2/shared-memory-card-ui.png'),
  momentsCover: require('../../assets/generated/wechat-v2/moments-cover.png'),
  avatarFrame: require('../../assets/generated/nana-2_5d/nana-avatar-frame-v2-clean.png'),
} as const;
