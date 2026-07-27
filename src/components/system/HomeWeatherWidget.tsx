import { useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Platform,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  MapPin,
  Moon,
  Sun,
} from 'lucide-react-native';
import { MotiView } from 'moti';
import { useApp } from '../../context/AppContext';
import { useNanaStore } from '../../stores/nanaStore';
import {
  createSimulatedWeather,
  loadWeather,
  type WeatherCondition,
  type WeatherPermissionState,
  type WeatherSnapshot,
} from '../../services/weatherRuntime';
import { neumorphicPalette, NeumorphicSurface } from '../neumorphic-surface';
import { GlassPanel } from './GlassPanel';

function useReducedMotionPreference() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (mounted) setReducedMotion(value);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reducedMotion;
}

function RainDrops({ color, reducedMotion }: { color: string; reducedMotion: boolean }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 10, right: 10, bottom: 3, height: 20 }}>
      {[0, 1, 2].map(index => (
        <MotiView
          key={index}
          from={{ opacity: 0.22, translateY: -3 }}
          animate={{ opacity: 0.9, translateY: reducedMotion ? 0 : 8 }}
          transition={{
            type: 'timing',
            duration: reducedMotion ? 1 : 760,
            delay: index * 170,
            loop: !reducedMotion,
          }}
          style={{
            position: 'absolute',
            left: 7 + index * 10,
            width: 2,
            height: 8,
            borderRadius: 2,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}

function SnowFlakes({ color, reducedMotion }: { color: string; reducedMotion: boolean }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 10, right: 10, bottom: 3, height: 19 }}>
      {[0, 1, 2].map(index => (
        <MotiView
          key={index}
          from={{ opacity: 0.35, translateY: -3, translateX: 0 }}
          animate={{
            opacity: 0.95,
            translateY: reducedMotion ? 0 : 8,
            translateX: reducedMotion ? 0 : index % 2 === 0 ? 2 : -2,
          }}
          transition={{
            type: 'timing',
            duration: reducedMotion ? 1 : 1_250,
            delay: index * 230,
            loop: !reducedMotion,
          }}
          style={{
            position: 'absolute',
            left: 7 + index * 10,
            width: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}

function WeatherGlyph({
  condition,
  isDay,
  neumorphic,
}: {
  condition: WeatherCondition;
  isDay: boolean;
  neumorphic: boolean;
}) {
  const reducedMotion = useReducedMotionPreference();
  const primary = neumorphic ? neumorphicPalette.berry : '#FFD6B8';
  const secondary = neumorphic ? '#6D6380' : 'rgba(231,238,255,0.88)';
  const rain = neumorphic ? '#6679A6' : '#A9CEFF';
  const iconSize = 44;

  if (condition === 'clear') {
    const Icon = isDay ? Sun : Moon;
    return (
      <MotiView
        from={{ rotate: '0deg', scale: 0.96 }}
        animate={{ rotate: reducedMotion ? '0deg' : '360deg', scale: 1 }}
        transition={{ type: 'timing', duration: reducedMotion ? 1 : 18_000, loop: !reducedMotion }}
      >
        <Icon size={iconSize} color={primary} strokeWidth={1.65} />
      </MotiView>
    );
  }

  if (condition === 'partly-cloudy') {
    const Icon = isDay ? CloudSun : CloudMoon;
    return (
      <MotiView
        from={{ translateX: -2 }}
        animate={{ translateX: reducedMotion ? 0 : 3 }}
        transition={{ type: 'timing', duration: reducedMotion ? 1 : 2_700, loop: !reducedMotion, repeatReverse: true }}
      >
        <Icon size={iconSize} color={primary} strokeWidth={1.65} />
      </MotiView>
    );
  }

  if (condition === 'rain' || condition === 'drizzle') {
    const Icon = condition === 'rain' ? CloudRain : CloudDrizzle;
    return (
      <View style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'flex-start' }}>
        <Icon size={43} color={secondary} strokeWidth={1.6} />
        <RainDrops color={rain} reducedMotion={reducedMotion} />
      </View>
    );
  }

  if (condition === 'snow') {
    return (
      <View style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'flex-start' }}>
        <CloudSnow size={43} color={secondary} strokeWidth={1.6} />
        <SnowFlakes color={rain} reducedMotion={reducedMotion} />
      </View>
    );
  }

  if (condition === 'thunder') {
    return (
      <MotiView
        from={{ opacity: 0.62, scale: 0.97 }}
        animate={{ opacity: 1, scale: reducedMotion ? 1 : 1.04 }}
        transition={{ type: 'timing', duration: reducedMotion ? 1 : 720, loop: !reducedMotion, repeatReverse: true }}
      >
        <CloudLightning size={iconSize} color={primary} strokeWidth={1.7} />
      </MotiView>
    );
  }

  if (condition === 'fog') {
    return (
      <MotiView
        from={{ translateX: -3 }}
        animate={{ translateX: reducedMotion ? 0 : 3 }}
        transition={{ type: 'timing', duration: reducedMotion ? 1 : 3_200, loop: !reducedMotion, repeatReverse: true }}
      >
        <CloudFog size={iconSize} color={secondary} strokeWidth={1.6} />
      </MotiView>
    );
  }

  return <Cloud size={iconSize} color={secondary} strokeWidth={1.6} />;
}

function SculptedWeatherMedallion({
  compact,
  condition,
  isDay,
}: {
  compact: boolean;
  condition: WeatherCondition;
  isDay: boolean;
}) {
  const outerSize = compact ? 66 : 70;
  const innerSize = compact ? 52 : 56;
  const outerRadius = outerSize / 2;
  const innerRadius = innerSize / 2;

  return (
    <View
      pointerEvents="none"
      style={{
        width: outerSize + 5,
        height: outerSize + 6,
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: 5,
          left: 5,
          width: outerSize,
          height: outerSize,
          borderRadius: outerRadius,
          backgroundColor: '#A87187',
          boxShadow: '5px 8px 12px rgba(9,7,24,0.40), 1px 2px 3px rgba(40,23,44,0.34)',
        }}
      />
      <NeumorphicSurface
        depth="raisedSmall"
        tone="pinkGold"
        radius={outerRadius}
        style={{
          width: outerSize,
          height: outerSize,
          backgroundColor: '#DDB0C0',
          boxShadow: '5px 7px 10px rgba(15,9,28,0.34), 1px 2px 3px rgba(49,27,48,0.34)',
        }}
        contentStyle={{ alignItems: 'center', justifyContent: 'center' }}
      >
        <NeumorphicSurface
          pointerEvents="none"
          depth="inset"
          tone="champagnePink"
          radius={innerRadius}
          style={{ width: innerSize, height: innerSize }}
          contentStyle={{ alignItems: 'center', justifyContent: 'center', overflow: 'visible' }}
        >
          <WeatherGlyph condition={condition} isDay={isDay} neumorphic />
        </NeumorphicSurface>
      </NeumorphicSurface>
    </View>
  );
}

export function HomeWeatherWidget({ compact = false }: { compact?: boolean }) {
  const { t } = useApp();
  const { width: viewportWidth } = useWindowDimensions();
  const language = useNanaStore(state => state.themeConfig.language);
  const chromeStyle = useNanaStore(state => state.themeConfig.chromeStyle);
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<WeatherSnapshot>(() => createSimulatedWeather());
  const [permission, setPermission] = useState<WeatherPermissionState>('undetermined');
  const [loading, setLoading] = useState(false);
  const isNeumorphic = chromeStyle === 'neumorphic-v1';
  const homeContentWidth = Math.min(viewportWidth - (compact ? 22 : 36), 390);
  const weatherColumnWidth = compact && viewportWidth <= 340 ? 86 : compact ? 94 : 108;
  const widgetGap = compact && viewportWidth <= 340 ? 18 : 26;
  const timeCardWidth = Math.min(
    compact ? 218 : 220,
    Math.max(184, homeContentWidth - weatherColumnWidth - widgetGap),
  );
  const timeCardHeight = Math.round(timeCardWidth / 1.52);
  const largeTimeCard = timeCardWidth >= 210;

  useEffect(() => {
    const timer = setInterval(() => {
      const nextNow = new Date();
      setNow(nextNow);
      setWeather(current => current.source === 'simulated' ? createSimulatedWeather(nextNow) : current);
    }, 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    loadWeather({ signal: controller.signal }).then(result => {
      if (!mounted) return;
      setPermission(result.permission);
      setWeather(result.snapshot);
    });
    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  const locale = language === 'zh' ? 'zh-CN' : 'en-US';
  const timeText = useMemo(
    () => new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: language !== 'zh',
    }).format(now),
    [language, locale, now],
  );
  const dateText = useMemo(
    () => new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      month: language === 'zh' ? 'numeric' : 'long',
      day: 'numeric',
    }).format(now),
    [language, locale, now],
  );

  const conditionLabels: Record<WeatherCondition, string> = {
    clear: t.weatherClear,
    'partly-cloudy': t.weatherPartlyCloudy,
    cloudy: t.weatherCloudy,
    fog: t.weatherFog,
    drizzle: t.weatherDrizzle,
    rain: t.weatherRain,
    snow: t.weatherSnow,
    thunder: t.weatherThunder,
  };
  const sourceLabel = weather.source === 'live'
    ? t.weatherLive
    : weather.source === 'cache'
      ? t.weatherCached
      : t.weatherSimulated;

  const refreshWeather = async (requestPermission: boolean) => {
    if (loading) return;
    setLoading(true);
    try {
      const result = await loadWeather({ requestPermission });
      setPermission(result.permission);
      setWeather(result.snapshot);
    } finally {
      setLoading(false);
    }
  };

  const handlePress = () => {
    if (Platform.OS === 'web' || permission === 'unavailable') {
      setWeather(createSimulatedWeather());
      return;
    }
    if (permission === 'granted') {
      void refreshWeather(false);
      return;
    }
    Alert.alert(
      t.weatherPermissionTitle,
      t.weatherPermissionBody,
      [
        { text: t.weatherPermissionCancel, style: 'cancel' },
        { text: t.weatherPermissionAllow, onPress: () => void refreshWeather(true) },
      ],
    );
  };

  const primaryText = isNeumorphic ? neumorphicPalette.onLightPrimary : '#FFF7F2';
  const secondaryText = isNeumorphic ? neumorphicPalette.onLightSecondary : 'rgba(241,239,255,0.78)';
  const systemContent = (
    <View
      style={{
        minHeight: compact ? 106 : 138,
        paddingHorizontal: compact ? 17 : 22,
        paddingVertical: compact ? 13 : 18,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{
            color: primaryText,
            fontSize: compact ? 30 : 38,
            lineHeight: compact ? 35 : 43,
            fontWeight: '800',
            letterSpacing: -1,
            fontVariant: ['tabular-nums'],
          }}
        >
          {timeText}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: secondaryText,
            fontSize: compact ? 11 : 12,
            lineHeight: 17,
            fontWeight: '700',
            marginTop: 1,
          }}
        >
          {dateText}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: compact ? 4 : 7 }}>
          <MapPin size={11} color={isNeumorphic ? neumorphicPalette.berry : '#F3B9AA'} strokeWidth={2} />
          <Text
            numberOfLines={1}
            style={{
              color: secondaryText,
              fontSize: 10.5,
              lineHeight: 14,
              fontWeight: '700',
            }}
          >
            {loading ? `${sourceLabel}…` : sourceLabel}
          </Text>
        </View>
      </View>

      <View style={{ alignItems: 'center', justifyContent: 'center', width: compact ? 102 : 118 }}>
        {isNeumorphic ? (
          <NeumorphicSurface
            pointerEvents="none"
            depth="raisedSmall"
            tone="pinkGold"
            radius={compact ? 25 : 29}
            fill={false}
            style={{ width: compact ? 50 : 58, height: compact ? 50 : 58 }}
            contentStyle={{ alignItems: 'center', justifyContent: 'center' }}
          >
            <WeatherGlyph condition={weather.condition} isDay={weather.isDay} neumorphic />
          </NeumorphicSurface>
        ) : (
          <View style={{ width: compact ? 56 : 64, height: compact ? 56 : 64, alignItems: 'center', justifyContent: 'center' }}>
            <WeatherGlyph condition={weather.condition} isDay={weather.isDay} neumorphic={false} />
          </View>
        )}
        <Text
          numberOfLines={1}
          style={{
            color: primaryText,
            fontSize: compact ? 18 : 21,
            lineHeight: compact ? 21 : 24,
            fontWeight: '800',
            marginTop: compact ? 2 : 4,
            fontVariant: ['tabular-nums'],
          }}
        >
          {weather.temperatureC}°
        </Text>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
          style={{
            width: '100%',
            color: secondaryText,
            fontSize: compact ? 10 : 11,
            lineHeight: compact ? 12 : 14,
            fontWeight: '700',
            textAlign: 'center',
            marginTop: 1,
          }}
        >
          {conditionLabels[weather.condition]}
        </Text>
      </View>
    </View>
  );

  if (isNeumorphic) {
    const floatingTextShadow = {
      textShadowColor: 'rgba(7, 10, 28, 0.74)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 5,
    } as const;

    return (
      <View
        style={{
          width: '100%',
          minHeight: timeCardHeight,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: widgetGap,
        }}
      >
        <View
          pointerEvents="none"
          style={{
            width: timeCardWidth,
            height: timeCardHeight,
            paddingRight: 3,
            paddingBottom: 4,
          }}
        >
          <View
            style={{
              position: 'absolute',
              top: 5,
              right: 0,
              bottom: 0,
              left: 5,
              borderRadius: 18,
              borderCurve: 'continuous',
              backgroundColor: '#8F84A2',
              boxShadow: '7px 10px 14px rgba(8,7,25,0.42), 2px 3px 4px rgba(30,22,45,0.38)',
            }}
          />
          <NeumorphicSurface
            pointerEvents="none"
            depth="raised"
            tone="lavender"
            radius={18}
            style={{
              flex: 1,
              minWidth: 0,
              backgroundColor: '#C9C0DA',
              boxShadow: '7px 9px 14px rgba(15,11,32,0.34), 2px 3px 4px rgba(38,28,54,0.30)',
            }}
            contentStyle={{
              paddingHorizontal: compact ? 17 : 19,
              paddingVertical: compact ? 14 : 16,
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: -3,
                bottom: -3,
                width: compact ? 44 : 54,
                height: compact ? 23 : 29,
                borderTopRightRadius: 19,
                backgroundColor: 'rgba(72,57,88,0.10)',
                boxShadow: 'inset 4px 4px 7px rgba(53,39,69,0.24), inset -3px -3px 6px rgba(255,252,255,0.28)',
              }}
            />
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
              minimumFontScale={0.82}
              style={{
                color: neumorphicPalette.onLightPrimary,
                fontSize: largeTimeCard ? 49 : 42,
                lineHeight: largeTimeCard ? 54 : 47,
                fontWeight: '800',
                letterSpacing: -1,
                fontVariant: ['tabular-nums'],
            }}
          >
            {timeText}
          </Text>
          <Text
            numberOfLines={1}
              style={{
                color: neumorphicPalette.onLightSecondary,
                fontSize: largeTimeCard ? 13.5 : 12,
                lineHeight: largeTimeCard ? 19 : 17,
                fontWeight: '700',
                marginTop: 2,
            }}
          >
            {dateText}
          </Text>
          <NeumorphicSurface
            pointerEvents="none"
            depth="inset"
            tone="lavender"
            radius={9}
            fill={false}
            style={{
              position: 'absolute',
              right: compact ? 9 : 12,
              bottom: compact ? 8 : 11,
              width: compact ? 38 : 43,
              height: 18,
            }}
            contentStyle={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            {[0, 1, 2].map(index => (
              <View
                key={index}
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: index === 0
                    ? neumorphicPalette.berry
                    : 'rgba(70,55,82,0.32)',
                  boxShadow: index === 0 ? '0 1px 2px rgba(61,35,54,0.28)' : undefined,
                }}
              />
            ))}
          </NeumorphicSurface>
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 3,
              right: 12,
              left: 12,
              height: 1.5,
              borderRadius: 1,
              backgroundColor: 'rgba(255,255,255,0.56)',
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              right: 9,
              bottom: 2,
              left: 12,
              height: 1.5,
              borderRadius: 1,
              backgroundColor: 'rgba(48,35,67,0.20)',
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              bottom: 2,
              left: 2,
              borderRadius: 16,
              borderCurve: 'continuous',
              borderTopWidth: 1,
              borderLeftWidth: 1,
              borderBottomWidth: 1,
              borderRightWidth: 1,
                borderTopColor: 'rgba(255,252,255,0.34)',
                borderLeftColor: 'rgba(255,252,255,0.28)',
                borderBottomColor: 'rgba(54,43,67,0.24)',
                borderRightColor: 'rgba(54,43,67,0.21)',
            }}
          />
          </NeumorphicSurface>
        </View>

        <Pressable
          testID="home-weather-widget"
          accessibilityRole="button"
          accessibilityLabel={`${conditionLabels[weather.condition]}, ${weather.temperatureC}°. ${t.weatherRefresh}`}
          accessibilityState={{ busy: loading }}
          onPress={handlePress}
          style={({ pressed }) => ({
            width: weatherColumnWidth,
            height: timeCardHeight,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.88 : 1,
            transform: [{ translateY: pressed ? 1 : 0 }, { scale: pressed ? 0.975 : 1 }],
          })}
        >
          <SculptedWeatherMedallion
            compact={compact}
            condition={weather.condition}
            isDay={weather.isDay}
          />
          <Text
            numberOfLines={1}
            style={{
              color: '#FFF8F5',
              fontSize: compact ? 18 : 22,
              lineHeight: compact ? 21 : 25,
              fontWeight: '800',
              marginTop: compact ? 2 : 4,
              fontVariant: ['tabular-nums'],
              ...floatingTextShadow,
            }}
          >
            {weather.temperatureC}°
          </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.78}
            style={{
              width: '100%',
              color: 'rgba(255,248,245,0.90)',
              fontSize: compact ? 9.5 : 10.5,
              lineHeight: compact ? 12 : 14,
              fontWeight: '700',
              textAlign: 'center',
              marginTop: 1,
              ...floatingTextShadow,
            }}
          >
            {loading ? `${conditionLabels[weather.condition]}…` : conditionLabels[weather.condition]}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      testID="home-weather-widget"
      accessibilityRole="button"
      accessibilityLabel={`${timeText}, ${conditionLabels[weather.condition]}, ${weather.temperatureC}°. ${t.weatherRefresh}`}
      accessibilityState={{ busy: loading }}
      onPress={handlePress}
      style={{ width: '100%', borderRadius: 22 }}
    >
      <GlassPanel
        borderRadius={22}
        colors={['rgba(29,39,78,0.84)', 'rgba(113,75,105,0.74)', 'rgba(237,173,162,0.42)']}
        style={{ minHeight: compact ? 106 : 138 }}
      >
        {systemContent}
      </GlassPanel>
    </Pressable>
  );
}
