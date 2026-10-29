/** Contrats de chasse de chaque extension : quotidiens et d'élite, et la quête qui les débloque. */
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { gameIconUrl } from '@/api/xivapi';
import { GameWindow } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Badge, Chip, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useHunt } from '@/hooks/use-hunt';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { billDone, nextReset, SECTION_RESET } from '@/shared/today';
import { billsOf, EXPANSION_NAMES } from '@/utils/hunt';

const SHORT = ['ARR', 'HW', 'SB', 'ShB', 'EW', 'DT'];

export default function HuntBillsScreen() {
  const theme = useTheme();
  const now = useNow(60_000);
  const { bills: inHand } = useHunt(now);
  const [expansion, setExpansion] = useState(EXPANSION_NAMES.length - 1);
  const bills = billsOf(expansion);
  const at = (section: 'daily' | 'weekly') =>
    new Date(nextReset(SECTION_RESET[section], now)).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  return (
    <Screen>
      <View style={styles.chips}>
        {SHORT.map((label, i) => (
          <Chip key={label} label={label} selected={expansion === i} onPress={() => setExpansion(i)} />
        ))}
      </View>
      {(['daily', 'elite'] as const).map((type) => (
        <GameWindow
          key={type}
          title={type === 'daily' ? 'Contrats quotidiens' : 'Contrats d’élite'}
          subtitle={type === 'daily' ? `Renouvelés chaque jour à ${at('daily')}` : `Renouvelés chaque mardi à ${at('weekly')}`}>
          {bills
            .filter((b) => b.type === type)
            .map((b) => {
              const held = inHand.find((h) => h.k === b.k);
              return (
                <Pressable
                  key={b.k}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/hunt/bill/[index]', params: { index: String(b.k) } })}
                  style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundSelected }]}>
                  <Image source={gameIconUrl(b.i)} style={styles.icon} contentFit="contain" />
                  <View style={styles.flex}>
                    <ThemedText type="smallBold" numberOfLines={2}>
                      {b.n}
                    </ThemedText>
                    {b.qn ? (
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        Débloqué par « {b.qn} »
                      </ThemedText>
                    ) : null}
                  </View>
                  {held ? <Badge label={billDone(held) ? 'Terminé' : 'En main'} tone={billDone(held) ? 'up' : 'accent'} /> : null}
                  <ThemedText themeColor="textSecondary">›</ThemedText>
                </Pressable>
              );
            })}
        </GameWindow>
      ))}
      <ThemedText type="small" themeColor="textSecondary">
        A Realm Reborn : contrats de ta Grande Compagnie. Heures de renouvellement à l’heure de ton téléphone.
      </ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one, borderRadius: 10 },
  icon: { width: 40, height: 40 },
});
