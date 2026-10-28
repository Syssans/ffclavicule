/**
 * Texte de la Légende, découpé en paragraphes, avec ses liens : les noms d'autres fiches ou de zones ressortent en
 * or et s'ouvrent d'un toucher, comme dans un wiki.
 */
import { router } from 'expo-router';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import type { LoreLink } from '@/utils/lore';

/** Ouvre la cible d'un lien : une fiche, ou une zone sur la carte. */
export function openLoreTarget(target: string) {
  if (target.startsWith('map:')) router.push({ pathname: '/map', params: { map: target.slice(4) } });
  else router.push({ pathname: '/lore/entry/[key]', params: { key: target } });
}

export function LoreText({ text, links = [], style }: { text: string; links?: LoreLink[]; style?: StyleProp<TextStyle> }) {
  const theme = useTheme();
  // Morceaux du texte : simples, ou liens.
  const parts: { text: string; target?: string }[] = [];
  let at = 0;
  for (const [start, length, target] of links) {
    if (start < at) continue;
    if (start > at) parts.push({ text: text.slice(at, start) });
    parts.push({ text: text.slice(start, start + length), target });
    at = start + length;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });

  return (
    <ThemedText style={[styles.body, style]}>
      {parts.map((p, i) =>
        p.target ? (
          <Text
            key={i}
            accessibilityRole="link"
            onPress={() => openLoreTarget(p.target!)}
            style={[styles.link, { color: theme.ornament, textDecorationColor: theme.ornament }]}>
            {p.text}
          </Text>
        ) : (
          p.text
        ),
      )}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 17, lineHeight: 27 },
  link: { fontWeight: '700', textDecorationLine: 'underline' },
});
