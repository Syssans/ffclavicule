/** Texte dont les mots cherchés ressortent (gras, couleur d'accent). */
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { highlightRanges, type SearchQuery } from '@/utils/search';

export function Highlighted({ text, query, numberOfLines = 1 }: { text: string; query: SearchQuery; numberOfLines?: number }) {
  const theme = useTheme();
  const ranges = highlightRanges(text, query);
  const parts: { text: string; hit: boolean }[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) parts.push({ text: text.slice(at, start), hit: false });
    parts.push({ text: text.slice(start, end), hit: true });
    at = end;
  }
  if (at < text.length) parts.push({ text: text.slice(at), hit: false });
  return (
    <ThemedText numberOfLines={numberOfLines}>
      {parts.map((p, i) =>
        p.hit ? (
          <ThemedText key={i} style={{ color: theme.accent, fontWeight: 700 }}>
            {p.text}
          </ThemedText>
        ) : (
          p.text
        ),
      )}
    </ThemedText>
  );
}
