/**
 * Graphiques de prix : une seule série (prix médian par jour).
 * Règles suivies : tracé 2 px, aire à 10 %, point final cerclé de la couleur de fond,
 * grille fine et discrète, valeur affichée seulement au bout de la courbe,
 * réticule + bulle au toucher pour lire n'importe quel jour.
 */
import { useState } from 'react';
import { type LayoutChangeEvent, type GestureResponderEvent, Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatGil } from '@/utils/format';
import type { PricePoint } from '@/utils/prices';

const DAY_MS = 86_400_000;
const PAD = { left: 44, right: 16, top: 16, bottom: 24 };
/** Police des graduations : celle du système (sinon le web prend une police à empattements). */
const AXIS_FONT = Platform.select({ web: 'system-ui, -apple-system, sans-serif', default: undefined });

/** « #B07A00 » + 0.1 -> « rgba(176,122,0,0.1) » : l'opacité de remplissage n'est pas gérée partout. */
function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** 1 234 -> « 1,2 k », 2 500 000 -> « 2,5 M ». */
export function formatCompact(value: number): string {
  const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: n < 10 ? 1 : 0 });
  if (value >= 1_000_000) return `${fmt(value / 1_000_000)} M`;
  if (value >= 1_000) return `${fmt(value / 1_000)} k`;
  return fmt(value);
}

function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/** Trois graduations « rondes » couvrant [min, max]. */
export function niceTicks(min: number, max: number): number[] {
  if (max <= min) return [min];
  const span = max - min;
  const step0 = span / 2;
  const magnitude = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= step0) ?? 10 * magnitude;
  const start = Math.floor(min / step) * step;
  return [start, start + step, start + 2 * step].filter((t) => t >= 0);
}

export function PriceChart({ points, days, height = 200 }: { points: PricePoint[]; days: number; height?: number }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <View style={[styles.empty, { height }]}>
        <ThemedText type="small" themeColor="textSecondary">
          Pas assez de ventes sur cette période pour tracer une courbe.
        </ThemedText>
      </View>
    );
  }

  const values = points.map((p) => p.median);
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const yMin = Math.min(ticks[0], ...values);
  const yMax = Math.max(ticks[ticks.length - 1], ...values);
  const lastDay = points[points.length - 1].day;
  const xStart = lastDay - (days - 1) * DAY_MS;

  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const x = (day: number) => PAD.left + ((day - xStart) / Math.max(DAY_MS, lastDay - xStart)) * plotW;
  const y = (v: number) => PAD.top + (1 - (v - yMin) / Math.max(1, yMax - yMin)) * plotH;

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)},${y(p.median).toFixed(1)}`).join(' ');
  const baseline = PAD.top + plotH;
  const area = `${line} L${x(lastDay).toFixed(1)},${baseline} L${x(points[0].day).toFixed(1)},${baseline} Z`;
  const last = points[points.length - 1];

  const pick = (e: GestureResponderEvent) => {
    const touchX = e.nativeEvent.locationX;
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(x(points[i].day) - touchX) < Math.abs(x(points[best].day) - touchX)) best = i;
    }
    setActive(best);
  };

  const shown = active !== null ? points[active] : null;
  const summary = `Prix médian par jour sur ${days} jours : de ${formatGil(Math.min(...values))} à ${formatGil(
    Math.max(...values),
  )}, dernier ${formatGil(last.median)} le ${formatDay(last.day)}.`;

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={summary}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={pick}
      onResponderMove={pick}
      onResponderRelease={() => setActive(null)}
      onResponderTerminate={() => setActive(null)}
      style={{ height }}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {ticks.map((t) => (
            <Line key={`g${t}`} x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={theme.grid} strokeWidth={1} />
          ))}
          {ticks.map((t) => (
            <SvgText key={`t${t}`} x={PAD.left - 8} y={y(t) + 4} fontSize={11} fontFamily={AXIS_FONT} fill={theme.textSecondary} textAnchor="end">
              {formatCompact(t)}
            </SvgText>
          ))}
          <SvgText x={PAD.left} y={height - 6} fontSize={11} fontFamily={AXIS_FONT} fill={theme.textSecondary} textAnchor="start">
            {formatDay(xStart)}
          </SvgText>
          <SvgText x={width - PAD.right} y={height - 6} fontSize={11} fontFamily={AXIS_FONT} fill={theme.textSecondary} textAnchor="end">
            {formatDay(lastDay)}
          </SvgText>

          <Path d={area} fill={withAlpha(theme.chart, 0.12)} />
          <Path d={line} stroke={theme.chart} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />

          {shown ? (
            <>
              <Line x1={x(shown.day)} x2={x(shown.day)} y1={PAD.top} y2={baseline} stroke={theme.textSecondary} strokeWidth={1} />
              <Circle cx={x(shown.day)} cy={y(shown.median)} r={5} fill={theme.chart} stroke={theme.backgroundElement} strokeWidth={2} />
            </>
          ) : (
            <Circle cx={x(last.day)} cy={y(last.median)} r={5} fill={theme.chart} stroke={theme.backgroundElement} strokeWidth={2} />
          )}
        </Svg>
      ) : null}

      {shown ? (
        <View
          pointerEvents="none"
          style={[
            styles.tooltip,
            {
              backgroundColor: theme.backgroundSelected,
              left: Math.min(Math.max(PAD.left, x(shown.day) - 70), Math.max(PAD.left, width - 150)),
            },
          ]}>
          <ThemedText type="small" themeColor="textSecondary">
            {formatDay(shown.day)} · {shown.units} vendus
          </ThemedText>
          <ThemedText type="smallBold">{formatGil(shown.median)}</ThemedText>
        </View>
      ) : null}
    </View>
  );
}

/** Petite courbe de tendance, sans axes (liste de favoris). */
export function Sparkline({ points, width = 64, height = 24 }: { points: PricePoint[]; width?: number; height?: number }) {
  const theme = useTheme();
  if (points.length < 2) return <View style={{ width, height }} />;
  const values = points.map((p) => p.median);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const first = points[0].day;
  const span = Math.max(1, points[points.length - 1].day - first);
  const pad = 4;
  const x = (d: number) => pad + ((d - first) / span) * (width - 2 * pad);
  const y = (v: number) => pad + (1 - (v - min) / Math.max(1, max - min)) * (height - 2 * pad);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)},${y(p.median).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height}>
        <Path d={d} stroke={theme.chart} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={x(last.day)} cy={y(last.median)} r={3} fill={theme.chart} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.three },
  tooltip: { position: 'absolute', top: 0, borderRadius: 10, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, minWidth: 130 },
});
