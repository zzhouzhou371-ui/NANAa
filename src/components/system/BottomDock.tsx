import { StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { BookOpen, MessageCircle, Settings, Users } from 'lucide-react-native';
import { AnimatedPressable, NativeGradient } from '../primitives';
import { NeumorphicSurface, neumorphicPalette } from '../neumorphic-surface';
import { useNanaStore } from '../../stores/nanaStore';
import { triggerHaptic } from '../../utils/haptics';

const dockItems = [
  { icon: MessageCircle, app: 'wechat', label: 'Open WeChat' },
  { icon: BookOpen, app: 'worldbook', label: 'Open World Book' },
  { icon: Users, app: 'characters', label: 'Open Characters' },
  { icon: Settings, app: 'settings', label: 'Open Settings' },
];

function HardwareDockShell({ compact }: { compact: boolean }) {
  const trackTop = compact ? 11 : 12;
  const trackBottom = compact ? 14 : 15;
  const dividerPositions = compact ? [28.23, 50, 71.77] : [28.69, 50, 71.31];

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      {/* A visible rear plate gives the dock a chassis, not just a cast shadow. */}
      <View
        style={{
          position: 'absolute',
          left: 4,
          right: 4,
          top: 7,
          bottom: -3,
          borderRadius: compact ? 27 : 30,
          borderCurve: 'continuous',
          backgroundColor: '#8D829F',
          boxShadow: '0 8px 12px rgba(18,12,39,0.42)',
        }}
      />

      <NeumorphicSurface
        depth="raised"
        tone="lavender"
        radius={compact ? 27 : 30}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 4, left: 0 }}
      />

      {/* Broad face slope; the surface itself owns the two restrained rim highlights. */}
      <NativeGradient
        direction="to-br"
        colors={[
          'rgba(255,252,255,0.18)',
          'rgba(255,252,255,0.03)',
          'rgba(55,42,68,0.12)',
        ]}
        borderRadius={compact ? 23 : 27}
        style={{
          position: 'absolute',
          top: 5,
          right: 5,
          bottom: 9,
          left: 5,
        }}
      >
        <View />
      </NativeGradient>

      {/* The rail is recessed inside the thick outer rim. */}
      <NeumorphicSurface
        depth="inset"
        tone="mist"
        radius={compact ? 19 : 22}
        shadowProfile="light"
        style={{
          position: 'absolute',
          left: compact ? 10 : 13,
          right: compact ? 10 : 13,
          top: trackTop,
          bottom: trackBottom,
          boxShadow:
            'inset 5px 5px 9px rgba(48,36,62,0.32), inset -2px -2px 5px rgba(255,252,255,0.28), inset 1px 1px 2px rgba(53,39,67,0.16)',
        }}
      />

      {/* Narrow rail lip keeps the cavity edge crisp without a dark groove. */}
      <View
        style={{
          position: 'absolute',
          left: compact ? 14 : 17,
          right: compact ? 14 : 17,
          top: trackTop + 4,
          bottom: trackBottom + 4,
          borderRadius: compact ? 16 : 18,
          borderCurve: 'continuous',
          borderTopWidth: 1,
          borderLeftWidth: 1,
          borderBottomWidth: 1,
          borderRightWidth: 1,
          borderTopColor: 'rgba(69,54,82,0.16)',
          borderLeftColor: 'rgba(69,54,82,0.11)',
          borderBottomColor: 'rgba(255,252,255,0.22)',
          borderRightColor: 'rgba(255,252,255,0.14)',
        }}
      />

      {dividerPositions.map(position => (
        <View
          key={position}
          style={{
            position: 'absolute',
            left: `${position}%`,
            top: compact ? 32 : 34,
            width: compact ? 4 : 5,
            height: compact ? 26 : 29,
            marginLeft: compact ? -2 : -2.5,
            borderRadius: 3,
            backgroundColor: '#A9A0BA',
            boxShadow:
              'inset 2px 2px 3px rgba(54,41,68,0.22), inset -1px -1px 2px rgba(255,252,255,0.30)',
          }}
        >
          <View
            style={{
              position: 'absolute',
              top: 3,
              right: 1,
              bottom: 3,
              width: 1,
              borderRadius: 1,
              backgroundColor: 'rgba(255,252,255,0.28)',
            }}
          />
        </View>
      ))}

      {(['left', 'right'] as const).map(side => (
        <View
          key={side}
          style={{
            position: 'absolute',
            [side]: compact ? 5 : 5,
            top: compact ? 38 : 41,
            width: compact ? 12 : 14,
            alignItems: side === 'left' ? 'flex-start' : 'flex-end',
            gap: 3,
          }}
        >
          {[8, 12, 8].map((width, index) => (
            <View
              key={index}
              style={{
                width,
                height: 2,
                borderRadius: 1,
                backgroundColor: 'rgba(71,55,84,0.34)',
                boxShadow: '0 1px 0 rgba(255,252,255,0.26)',
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

export function BottomDock({ compact = false }: { compact?: boolean }) {
  const setActiveApp = useNanaStore(s => s.setActiveApp);
  const chromeStyle = useNanaStore(s => s.themeConfig.chromeStyle);
  const neumorphic = chromeStyle === 'neumorphic-v1';
  const keySize = compact ? 50 : 52;
  const keyFaceSize = compact ? 46 : 48;

  return (
    <View
      testID="home-bottom-dock"
      style={{
        position: 'relative',
        width: neumorphic ? compact ? 294 : '100%' : undefined,
        alignSelf: neumorphic ? 'center' : undefined,
        height: neumorphic ? compact ? 90 : 96 : compact ? 82 : 104,
        paddingHorizontal: neumorphic ? compact ? 26 : 31 : 25,
        paddingVertical: neumorphic ? compact ? 20 : 22 : undefined,
        paddingTop: neumorphic ? undefined : compact ? 11 : 18,
        paddingBottom: neumorphic ? undefined : compact ? 13 : 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        ...(neumorphic ? null : {
          shadowColor: '#120D23',
          shadowOffset: { width: 0, height: 7 },
          shadowOpacity: 0.24,
          shadowRadius: 10,
          elevation: 5,
        }),
      }}
    >
      {neumorphic ? (
        <HardwareDockShell compact={compact} />
      ) : (
        <ExpoImage
          source={require('../../../assets/generated/nana-2_5d/nana-cloud-dock-v2-clean-v2.png')}
          contentFit="fill"
          transition={120}
          style={StyleSheet.absoluteFillObject}
        />
      )}

      {dockItems.map((item, index) => {
        const Icon = item.icon;
        return (
          <AnimatedPressable
            key={index}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            scale={0.94}
            onPress={() => {
              triggerHaptic('light');
              setActiveApp(item.app);
            }}
            style={{
              zIndex: 2,
              width: neumorphic ? keySize : compact ? 42 : 48,
              height: neumorphic ? keySize : compact ? 42 : 48,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: neumorphic ? keySize : compact ? 42 : 48,
                height: neumorphic ? keySize : compact ? 42 : 48,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {neumorphic ? (
                <>
                  {/* Each key sits in its own recessed socket and has a visible lower skirt. */}
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      width: keySize,
                      height: keySize,
                      borderRadius: compact ? 13 : 17,
                      backgroundColor: '#A49AB7',
                      boxShadow:
                        'inset 3px 3px 5px rgba(50,37,64,0.28), inset -2px -2px 4px rgba(255,252,255,0.32)',
                    }}
                  />
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: compact ? 4 : 5,
                      width: keyFaceSize,
                      height: keyFaceSize + 1,
                      borderRadius: compact ? 14 : 16,
                      backgroundColor: index === 0 ? '#A77488' : '#817790',
                    }}
                  />
                  <NeumorphicSurface
                    pointerEvents="none"
                    depth="raisedSmall"
                    tone={index === 0 ? 'pinkGold' : 'lavender'}
                    radius={compact ? 14 : 16}
                    style={{
                      position: 'absolute',
                      top: 1,
                      width: keyFaceSize,
                      height: keyFaceSize,
                      boxShadow: index === 0
                        ? '-3px -3px 5px rgba(255,252,255,0.38), 4px 6px 7px rgba(57,39,64,0.32), 1px 2px 2px rgba(49,34,58,0.24)'
                        : '-3px -3px 5px rgba(255,252,255,0.34), 4px 6px 7px rgba(51,38,65,0.30), 1px 2px 2px rgba(49,34,58,0.22)',
                    }}
                    contentStyle={{ alignItems: 'center', justifyContent: 'center' }}
                  >
                    <View
                      style={{
                        position: 'absolute',
                        top: 3,
                        right: 4,
                        bottom: 5,
                        left: 3,
                        borderRadius: compact ? 11 : 13,
                        borderCurve: 'continuous',
                        borderTopWidth: 1,
                        borderLeftWidth: 1,
                        borderBottomWidth: 1,
                        borderRightWidth: 1,
                        borderTopColor: 'rgba(255,252,255,0.38)',
                        borderLeftColor: 'rgba(255,252,255,0.22)',
                        borderBottomColor: 'rgba(59,44,70,0.18)',
                        borderRightColor: 'rgba(59,44,70,0.12)',
                      }}
                    />
                    <Icon
                      size={compact ? 19 : 22}
                      color={index === 0 ? neumorphicPalette.berry : neumorphicPalette.onLightPrimary}
                      strokeWidth={1.85}
                    />
                  </NeumorphicSurface>
                </>
              ) : (
                <NativeGradient
                  direction="to-br"
                  colors={['rgba(21,31,64,0.92)', 'rgba(102,65,88,0.82)']}
                  borderRadius={20}
                  style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 0.75, borderColor: 'rgba(248,168,145,0.72)' }}
                >
                  <Icon size={20} color="#F3B9AA" strokeWidth={1.65} />
                </NativeGradient>
              )}
            </View>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}
