import { useState, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Image as ExpoImage, type ImageSource } from 'expo-image';
import { Check, ImagePlus } from 'lucide-react-native';
import { AnimatedPressable } from './primitives';
import { useApp } from '../context/AppContext';
import { useNanaStore } from '../stores/nanaStore';
import {
  CHROME_STYLE_OPTIONS,
  ICON_PACK_OPTIONS,
  WALLPAPER_OPTIONS,
} from '../services/theme';
import {
  cleanupReplacedWallpaper,
  pickWallpaperFromLibrary,
} from '../services/nativeImagePickerRuntime';
import type { ChromeStyle, IconStyle, WallpaperId } from '../types';
import { NeumorphicSurface, neumorphicPalette } from './neumorphic-surface';

const FONTS = ['font-sans', 'font-serif', 'font-mono'] as const;

function ChoicePill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ minHeight: 44, borderRadius: 14 }}
    >
      <NeumorphicSurface
        pointerEvents="none"
        depth={selected ? 'raisedSmall' : 'inset'}
        tone={selected ? 'pinkGold' : 'lavender'}
        radius={14}
        fill={false}
        contentStyle={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 14 }}
      >
        <Text
          style={{
            color: neumorphicPalette.onLightPrimary,
            fontSize: 13,
            fontWeight: selected ? '800' : '700',
          }}
        >
          {label}
        </Text>
      </NeumorphicSurface>
    </AnimatedPressable>
  );
}

function ThemePanel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <NeumorphicSurface
      depth="raised"
      tone="lavender"
      radius={20}
      fill={false}
      contentStyle={{ padding: 16 }}
    >
      <Text
        style={{
          color: neumorphicPalette.onLightPrimary,
          fontSize: 16,
          lineHeight: 21,
          fontWeight: '800',
        }}
      >
        {title}
      </Text>
      {description ? (
        <Text
          style={{
            color: neumorphicPalette.onLightSecondary,
            fontSize: 13,
            lineHeight: 19,
            marginTop: 4,
            marginBottom: 15,
          }}
        >
          {description}
        </Text>
      ) : (
        <View style={{ height: 14 }} />
      )}
      {children}
    </NeumorphicSurface>
  );
}

function SelectedBadge() {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 7,
        right: 7,
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: neumorphicPalette.berry,
      }}
    >
      <Check size={15} strokeWidth={3} color={neumorphicPalette.onBerry} />
    </View>
  );
}

function WallpaperChoice({
  label,
  source,
  selected,
  onPress,
}: {
  label: string;
  source: ImageSource | number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      scale={0.97}
      style={{ width: 92, borderRadius: 17 }}
    >
      <NeumorphicSurface
        pointerEvents="none"
        depth={selected ? 'raisedSmall' : 'inset'}
        tone={selected ? 'pinkGold' : 'lavender'}
        radius={17}
        fill={false}
        contentStyle={{ padding: 5 }}
      >
        <View
          style={{
            height: 116,
            borderRadius: 13,
            borderCurve: 'continuous',
            overflow: 'hidden',
            backgroundColor: neumorphicPalette.soft,
          }}
        >
          <ExpoImage
            source={source}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={0}
            style={{ width: '100%', height: '100%' }}
          />
          {selected ? <SelectedBadge /> : null}
        </View>
      </NeumorphicSurface>
      <Text
        numberOfLines={2}
        style={{
          minHeight: 34,
          paddingTop: 8,
          color: neumorphicPalette.onLightPrimary,
          fontSize: 12,
          lineHeight: 16,
          fontWeight: selected ? '800' : '700',
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function IconPackChoice({
  label,
  source,
  selected,
  onPress,
}: {
  label: string;
  source: ImageSource | number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      scale={0.98}
      style={{ flex: 1, minWidth: 0, borderRadius: 17 }}
    >
      <NeumorphicSurface
        pointerEvents="none"
        depth={selected ? 'raisedSmall' : 'inset'}
        tone={selected ? 'pinkGold' : 'lavender'}
        radius={17}
        fill={false}
        contentStyle={{ padding: 7 }}
      >
        <View
          style={{
            height: 118,
            borderRadius: 12,
            borderCurve: 'continuous',
            overflow: 'hidden',
            backgroundColor: neumorphicPalette.soft,
          }}
        >
          <ExpoImage
            source={source}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={0}
            style={{ width: '100%', height: '100%' }}
          />
          {selected ? <SelectedBadge /> : null}
        </View>
      </NeumorphicSurface>
      <Text
        numberOfLines={2}
        style={{
          minHeight: 34,
          paddingTop: 8,
          color: neumorphicPalette.onLightPrimary,
          fontSize: 12,
          lineHeight: 16,
          fontWeight: selected ? '800' : '700',
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function ChromeStyleChoice({
  label,
  styleId,
  selected,
  onPress,
}: {
  label: string;
  styleId: ChromeStyle;
  selected: boolean;
  onPress: () => void;
}) {
  const neumorphic = styleId === 'neumorphic-v1';
  const previewInk = neumorphic ? neumorphicPalette.onLightPrimary : '#F8EDEA';
  const previewMuted = neumorphic ? neumorphicPalette.onLightSecondary : 'rgba(238,232,248,0.66)';

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      scale={0.98}
      style={{ flex: 1, minWidth: 0, borderRadius: 17 }}
    >
      <NeumorphicSurface
        pointerEvents="none"
        depth={selected ? 'raisedSmall' : 'inset'}
        tone={selected ? 'pinkGold' : 'lavender'}
        radius={17}
        fill={false}
        contentStyle={{ padding: 7 }}
      >
        <View
          style={{
            height: 118,
            borderRadius: 12,
            borderCurve: 'continuous',
            overflow: 'hidden',
            backgroundColor: neumorphic ? neumorphicPalette.base : '#26345F',
            paddingHorizontal: 9,
            paddingVertical: 8,
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: neumorphic ? 54 : 45,
              height: neumorphic ? 14 : 12,
              borderRadius: 7,
              backgroundColor: neumorphic ? neumorphicPalette.soft : 'rgba(24,15,29,0.8)',
              boxShadow: neumorphic ? '2px 2px 4px rgba(54,43,67,0.24), -2px -2px 4px rgba(255,252,255,0.34)' : undefined,
              flexDirection: 'row',
              alignItems: 'center',
              paddingLeft: 7,
            }}
          >
            {neumorphic ? (
              <>
                <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: neumorphicPalette.berry }} />
                <View style={{ width: 11, height: 1.5, borderRadius: 1, backgroundColor: 'rgba(77,63,89,0.30)', marginLeft: 3 }} />
                <ExpoImage
                  source={require('../../assets/generated/nana-kuromi-v1/kuromi-soft-3d.png')}
                  contentFit="contain"
                  style={{ position: 'absolute', right: -2, top: -5, width: 24, height: 24 }}
                />
              </>
            ) : null}
          </View>
          <View
            style={{
              flex: 1,
              marginTop: 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <View
              style={{
                flex: 1,
                alignSelf: 'stretch',
                borderRadius: 8,
                paddingHorizontal: 8,
                justifyContent: 'center',
                backgroundColor: neumorphic ? neumorphicPalette.lavender : 'rgba(121,88,126,0.54)',
                boxShadow: neumorphic ? '3px 3px 6px rgba(54,43,67,0.22), -3px -3px 6px rgba(255,252,255,0.32)' : undefined,
              }}
            >
              <Text style={{ color: previewInk, fontSize: 15, lineHeight: 17, fontWeight: '900' }}>9:41</Text>
              <View style={{ width: 26, height: 3, borderRadius: 2, backgroundColor: previewMuted, marginTop: 3 }} />
            </View>
            <View
              style={{
                width: 30,
                alignSelf: 'stretch',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: neumorphic ? neumorphicPalette.champagnePink : 'rgba(244,183,169,0.58)',
                  boxShadow: neumorphic ? '2px 2px 4px rgba(54,43,67,0.24), -2px -2px 4px rgba(255,252,255,0.32)' : undefined,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: neumorphicPalette.accent }} />
              </View>
              <View style={{ width: 15, height: 2, borderRadius: 1, backgroundColor: previewMuted, marginTop: 3 }} />
            </View>
          </View>
          <View
            style={{
              height: 22,
              borderRadius: neumorphic ? 8 : 10,
              marginTop: 7,
              paddingHorizontal: neumorphic ? 10 : 8,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: neumorphic ? neumorphicPalette.lavender : 'rgba(184,153,180,0.54)',
              boxShadow: neumorphic ? '3px 3px 6px rgba(54,43,67,0.22), -3px -3px 6px rgba(255,252,255,0.32)' : undefined,
            }}
          >
            {[0, 1, 2, 3].map(index => (
              <View
                key={index}
                style={{
                  width: neumorphic ? 14 : 12,
                  height: neumorphic ? 14 : 12,
                  borderRadius: neumorphic ? 4 : 6,
                  backgroundColor: neumorphic
                    ? index === 0 ? neumorphicPalette.accent : neumorphicPalette.soft
                    : index === 0 ? '#F2AA98' : 'rgba(34,28,58,0.84)',
                  boxShadow: neumorphic ? '1px 1px 2px rgba(54,43,67,0.25), -1px -1px 2px rgba(255,252,255,0.30)' : undefined,
                }}
              />
            ))}
          </View>
          {selected ? <SelectedBadge /> : null}
        </View>
      </NeumorphicSurface>
      <Text
        numberOfLines={2}
        style={{
          minHeight: 34,
          paddingTop: 8,
          color: neumorphicPalette.onLightPrimary,
          fontSize: 12,
          lineHeight: 16,
          fontWeight: selected ? '800' : '700',
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

export function ThemeView() {
  const { t } = useApp();
  const themeConfig = useNanaStore(state => state.themeConfig);
  const [wallpaperBusy, setWallpaperBusy] = useState(false);
  const [wallpaperError, setWallpaperError] = useState('');

  const wallpaperLabels: Record<Exclude<WallpaperId, 'custom'>, string> = {
    system: t.systemWallpaper,
    'lavender-nocturne': t.lavenderNocturne,
    'peach-quiet': t.peachQuiet,
    'blue-hour': t.blueHour,
  };
  const iconLabels: Record<IconStyle, string> = {
    system: t.systemIcons,
    'neumorphic-v1': t.neumorphicIcons,
  };
  const chromeLabels: Record<ChromeStyle, string> = {
    system: t.systemChrome,
    'neumorphic-v1': t.neumorphicChrome,
  };
  const fontLabels: Record<(typeof FONTS)[number], string> = {
    'font-sans': t.defaultSans,
    'font-serif': t.elegantSerif,
    'font-mono': t.technicalMono,
  };

  const updateTheme = (patch: Partial<typeof themeConfig>) => {
    useNanaStore.setState(state => ({
      themeConfig: { ...state.themeConfig, ...patch },
    }));
  };

  const chooseWallpaper = async () => {
    if (wallpaperBusy) return;
    setWallpaperBusy(true);
    setWallpaperError('');
    const previousUri = useNanaStore.getState().themeConfig.backgroundImage;
    try {
      const result = await pickWallpaperFromLibrary();
      if (result.phase === 'failed') {
        setWallpaperError(result.errorMessage || t.wallpaperPickerError);
        return;
      }
      if (result.phase !== 'ready' || !result.localUri) return;
      updateTheme({ wallpaperId: 'custom', backgroundImage: result.localUri });
      cleanupReplacedWallpaper(previousUri, result.localUri);
    } catch {
      setWallpaperError(t.wallpaperPickerError);
    } finally {
      setWallpaperBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 3, paddingBottom: 28, gap: 18 }}
      >
        <ThemePanel title={t.wallpaper} description={t.wallpaperDescription}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12, padding: 7 }}
          >
            {WALLPAPER_OPTIONS.map(option => (
              <WallpaperChoice
                key={option.id}
                label={wallpaperLabels[option.id]}
                source={option.previewSource}
                selected={themeConfig.wallpaperId === option.id}
                onPress={() => updateTheme({ wallpaperId: option.id })}
              />
            ))}
            {themeConfig.backgroundImage ? (
              <WallpaperChoice
                label={t.customWallpaper}
                source={{ uri: themeConfig.backgroundImage }}
                selected={themeConfig.wallpaperId === 'custom'}
                onPress={() => updateTheme({ wallpaperId: 'custom' })}
              />
            ) : null}
          </ScrollView>

          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={themeConfig.backgroundImage ? t.replaceFromPhotos : t.addFromPhotos}
            accessibilityState={{ disabled: wallpaperBusy, busy: wallpaperBusy }}
            disabled={wallpaperBusy}
            onPress={() => void chooseWallpaper()}
            style={{ minHeight: 48, marginTop: 8, borderRadius: 14 }}
          >
            <NeumorphicSurface
              pointerEvents="none"
              depth="raisedSmall"
              tone="pinkGold"
              radius={14}
              fill={false}
              contentStyle={{
                minHeight: 48,
                paddingHorizontal: 15,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 9,
              }}
            >
              <ImagePlus size={19} color={neumorphicPalette.onLightPrimary} />
              <Text
                style={{
                  color: neumorphicPalette.onLightPrimary,
                  fontSize: 14,
                  fontWeight: '800',
                }}
              >
                {wallpaperBusy
                  ? t.wallpaperSaving
                  : themeConfig.backgroundImage
                    ? t.replaceFromPhotos
                    : t.addFromPhotos}
              </Text>
            </NeumorphicSurface>
          </AnimatedPressable>
          {wallpaperError ? (
            <Text
              accessibilityLiveRegion="polite"
              style={{
                color: neumorphicPalette.berry,
                fontSize: 12,
                lineHeight: 17,
                fontWeight: '700',
                paddingTop: 10,
              }}
            >
              {wallpaperError}
            </Text>
          ) : null}
        </ThemePanel>

        <ThemePanel title={t.iconPack} description={t.iconPackDescription}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {ICON_PACK_OPTIONS.map(option => (
              <IconPackChoice
                key={option.id}
                label={iconLabels[option.id]}
                source={option.previewSource}
                selected={themeConfig.iconStyle === option.id}
                onPress={() => updateTheme({ iconStyle: option.id })}
              />
            ))}
          </View>
        </ThemePanel>

        <ThemePanel title={t.phoneChrome} description={t.phoneChromeDescription}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {CHROME_STYLE_OPTIONS.map(option => (
              <ChromeStyleChoice
                key={option.id}
                label={chromeLabels[option.id]}
                styleId={option.id}
                selected={themeConfig.chromeStyle === option.id}
                onPress={() => updateTheme({ chromeStyle: option.id })}
              />
            ))}
          </View>
        </ThemePanel>

        <ThemePanel title={t.systemFont}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
            {FONTS.map(font => (
              <ChoicePill
                key={font}
                label={fontLabels[font]}
                selected={themeConfig.fontFamily === font}
                onPress={() => updateTheme({ fontFamily: font })}
              />
            ))}
          </View>
        </ThemePanel>

        <ThemePanel title={t.language}>
          <View style={{ flexDirection: 'row', gap: 9 }}>
            {(['en', 'zh'] as const).map(language => (
              <ChoicePill
                key={language}
                label={language === 'en' ? t.english : t.chinese}
                selected={themeConfig.language === language}
                onPress={() => updateTheme({ language })}
              />
            ))}
          </View>
        </ThemePanel>
      </ScrollView>
    </View>
  );
}
