import { useCallback, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw, Sparkles } from 'lucide-react-native';
import { ActivityIndicator, Text, View } from 'react-native';
import {
  buildMeetingPresetRuleSummary,
  generateLocalMeetingPresetTrial,
  type MeetingPresetTrialInput,
  type MeetingPresetTrialResult,
} from '../domain/meeting-preset-trial';
import type { MeetingConfig } from '../domain/meeting-types';
import { AnimatedPressable } from '../../../components/primitives';
import { NeumorphicSurface, neumorphicPalette } from '../../../components/neumorphic-surface';

export interface MeetingPresetTrialPanelProps {
  config: MeetingConfig;
  mainPrompt?: string;
  isZh: boolean;
  generateTrial?: (input: MeetingPresetTrialInput) => Promise<MeetingPresetTrialResult>;
}

type TrialState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; result: MeetingPresetTrialResult };

export function MeetingPresetTrialPanel({
  config,
  mainPrompt,
  isZh,
  generateTrial = generateLocalMeetingPresetTrial,
}: MeetingPresetTrialPanelProps) {
  const [rulesExpanded, setRulesExpanded] = useState(false);
  const [trial, setTrial] = useState<TrialState>({ status: 'idle' });
  const [variant, setVariant] = useState(0);
  const rules = useMemo(
    () => buildMeetingPresetRuleSummary(config, { mainPrompt, isZh }),
    [config, isZh, mainPrompt],
  );
  const generate = useCallback(async () => {
    const nextVariant = variant + 1;
    setVariant(nextVariant);
    setTrial({ status: 'loading' });
    try {
      const result = await generateTrial({ config, mainPrompt, isZh, variant: nextVariant });
      setTrial({ status: 'success', result });
    } catch (error) {
      setTrial({
        status: 'error',
        message: error instanceof Error && error.message.trim()
          ? error.message.trim()
          : (isZh ? '本地试写暂时无法生成。' : 'The local trial could not be generated.'),
      });
    }
  }, [config, generateTrial, isZh, mainPrompt, variant]);

  const result = trial.status === 'success' ? trial.result : undefined;
  return (
    <View testID="meeting-preset-trial-panel" style={{ gap: 12, paddingBottom: 18 }}>
      <View style={{ borderTopWidth: 1, borderTopColor: neumorphicPalette.hairline }}>
        <AnimatedPressable
          testID="meeting-preset-effective-rules-toggle"
          accessibilityRole="button"
          accessibilityLabel={isZh ? '查看最终生效规则' : 'View effective rules'}
          accessibilityState={{ expanded: rulesExpanded }}
          onPress={() => setRulesExpanded(current => !current)}
          style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10 }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 14, lineHeight: 20, fontWeight: '800' }}>
              {isZh ? '最终生效规则' : 'Effective rules'}
            </Text>
            <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11, lineHeight: 16 }}>
              {isZh ? '这里显示实际送给导演的设置，不靠猜。' : 'The settings the director actually receives.'}
            </Text>
          </View>
          {rulesExpanded
            ? <ChevronDown size={19} color={neumorphicPalette.onLightPrimary} />
            : <ChevronRight size={19} color={neumorphicPalette.onLightPrimary} />}
        </AnimatedPressable>
        {rulesExpanded ? (
          <NeumorphicSurface depth="inset" tone="lavender" radius={16} contentStyle={{ paddingHorizontal: 13, paddingVertical: 7 }}>
            {rules.map((rule, index) => (
              <View
                key={rule.id}
                style={{
                  minHeight: 44,
                  paddingVertical: 9,
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 10,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: neumorphicPalette.hairline,
                }}
              >
                <Text style={{ width: 58, color: neumorphicPalette.relationship, fontSize: 11, lineHeight: 17, fontWeight: '800' }}>
                  {rule.label}
                </Text>
                <Text style={{ flex: 1, color: neumorphicPalette.onLightPrimary, fontSize: 12, lineHeight: 18, fontWeight: '600' }}>
                  {rule.value}
                </Text>
              </View>
            ))}
          </NeumorphicSurface>
        ) : null}
      </View>

      <View style={{ gap: 9 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Sparkles size={16} color={neumorphicPalette.relationship} />
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 14, lineHeight: 20, fontWeight: '800' }}>
              {isZh ? '不保存的本地试写' : 'Unsaved local trial'}
            </Text>
            <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11, lineHeight: 16 }}>
              {isZh ? '先看看排版、人称和小剧场是否合心意。' : 'Check layout, viewpoint, and theater before saving.'}
            </Text>
          </View>
        </View>

        <AnimatedPressable
          testID="meeting-preset-generate-trial"
          accessibilityRole="button"
          accessibilityLabel={trial.status === 'error'
            ? (isZh ? '重试本地试写' : 'Retry local trial')
            : (isZh ? '生成本地试写' : 'Generate local trial')}
          accessibilityState={{ disabled: trial.status === 'loading', busy: trial.status === 'loading' }}
          disabled={trial.status === 'loading'}
          onPress={generate}
          style={{ minHeight: 48, borderRadius: 15 }}
        >
          <NeumorphicSurface
            pointerEvents="none"
            depth={trial.status === 'loading' ? 'inset' : 'raisedSmall'}
            tone="pinkGold"
            radius={15}
            style={{ position: 'absolute', inset: 0 }}
            contentStyle={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14 }}
          >
            {trial.status === 'loading'
              ? <ActivityIndicator size="small" color={neumorphicPalette.relationship} />
              : <RefreshCw size={16} color={neumorphicPalette.relationship} />}
            <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 13, lineHeight: 18, fontWeight: '800' }}>
              {trial.status === 'loading'
                ? (isZh ? '正在排一小段……' : 'Preparing a sample…')
                : trial.status === 'error'
                  ? (isZh ? '重试' : 'Retry')
                  : result
                    ? (isZh ? '换一个本地样例' : 'Try another sample')
                    : (isZh ? '生成本地样例' : 'Generate local sample')}
            </Text>
          </NeumorphicSurface>
        </AnimatedPressable>

        {trial.status === 'error' ? (
          <NeumorphicSurface testID="meeting-preset-trial-error" depth="inset" tone="berry" radius={14} contentStyle={{ paddingHorizontal: 13, paddingVertical: 12 }}>
            <Text style={{ color: neumorphicPalette.onBerry, fontSize: 12, lineHeight: 18 }}>{trial.message}</Text>
          </NeumorphicSurface>
        ) : null}

        {result ? (
          <NeumorphicSurface testID="meeting-preset-trial-result" depth="inset" tone="lavender" radius={18} contentStyle={{ paddingHorizontal: 16, paddingVertical: 18, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: neumorphicPalette.relationship }} />
              <Text style={{ color: neumorphicPalette.relationship, fontSize: 10, lineHeight: 15, fontWeight: '900', letterSpacing: 1.1 }}>
                {isZh ? '本地样例 · 不保存' : 'LOCAL SAMPLE · UNSAVED'}
              </Text>
            </View>
            {result.chapterTitle ? (
              <Text style={{ color: neumorphicPalette.relationship, fontSize: 20, lineHeight: 27, fontWeight: '700', textAlign: 'center' }}>
                {result.chapterTitle}
              </Text>
            ) : null}
            {result.leadQuote ? (
              <Text style={{ color: '#A77789', fontSize: 17, lineHeight: 27, fontStyle: 'italic', textAlign: 'center' }}>
                {result.leadQuote}
              </Text>
            ) : null}
            <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 13, lineHeight: 22 }}>
              {result.playerParagraph}
            </Text>
            {result.narrationParagraphs.slice(0, 1).map((paragraph, index) => (
              <Text key={`narration-opening-${index}`} style={{ color: neumorphicPalette.onLightPrimary, fontSize: 14, lineHeight: 24 }}>
                {paragraph}
              </Text>
            ))}
            <View style={{ gap: 5 }}>
              <Text style={{ color: neumorphicPalette.relationship, fontSize: 12, lineHeight: 18, fontWeight: '800' }}>
                {result.characterName}
              </Text>
              {result.characterParagraphs.map((paragraph, index) => (
                <Text key={`character-${index}`} style={{ color: neumorphicPalette.onLightPrimary, fontSize: 14, lineHeight: 24 }}>
                  {paragraph}
                </Text>
              ))}
            </View>
            {result.narrationParagraphs.slice(1).map((paragraph, index) => (
              <Text key={`narration-closing-${index}`} style={{ color: neumorphicPalette.onLightPrimary, fontSize: 14, lineHeight: 24 }}>
                {paragraph}
              </Text>
            ))}
            {result.miniTheater ? (
              <View style={{ borderTopWidth: 1, borderTopColor: neumorphicPalette.hairline, paddingTop: 11, gap: 4 }}>
                <Text style={{ color: '#A77789', fontSize: 12, lineHeight: 18, fontWeight: '800' }}>
                  {isZh ? '小剧场尾注' : 'Mini-theater endnote'} · {result.miniTheater.title}
                </Text>
                <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 12, lineHeight: 20 }}>
                  {result.miniTheater.content}
                </Text>
              </View>
            ) : null}
            <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 10, lineHeight: 16 }}>
              {result.note}
            </Text>
          </NeumorphicSurface>
        ) : null}
      </View>
    </View>
  );
}
