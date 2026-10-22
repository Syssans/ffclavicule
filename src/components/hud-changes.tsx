/** File des modifications de l'ATH : envoi, suivi (« en attente du jeu », « appliquée »…) et annulation. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { cancelChange, getHud, listChanges, sendChange, STATUS_LABELS, type HudChangeBody, type QueuedChange } from '@/api/hud';
import { ThemedText } from '@/components/themed-text';
import { Badge, Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatAgo } from '@/utils/format';

/** Relevé de l'ATH et file des modifications, rafraîchis souvent tant qu'une modification attend le jeu. */
export function useHud(id: number, token: string | undefined) {
  const client = useQueryClient();
  const changes = useQuery({
    queryKey: ['hud-changes', id, token],
    queryFn: () => listChanges(id, token!),
    enabled: Boolean(token),
    refetchInterval: (query) => (query.state.data?.some((c) => c.status === 'pending') ? 3000 : 30_000),
  });
  const hud = useQuery({
    queryKey: ['hud', id, token],
    queryFn: () => getHud(id, token!),
    enabled: Boolean(token),
    refetchInterval: 60_000,
  });

  // Une modification vient d'être traitée : le plugin renvoie le relevé juste après.
  const pending = changes.data?.filter((c) => c.status === 'pending').length ?? 0;
  const before = useRef(pending);
  useEffect(() => {
    if (pending < before.current) {
      const timer = setTimeout(() => client.invalidateQueries({ queryKey: ['hud', id] }), 2500);
      before.current = pending;
      return () => clearTimeout(timer);
    }
    before.current = pending;
  }, [pending, client, id]);

  const send = useMutation({
    mutationFn: async (bodies: HudChangeBody[]) => {
      const sent: QueuedChange[] = [];
      for (const body of bodies) sent.push(await sendChange(id, token!, body));
      return sent;
    },
    onSuccess: (sent) => {
      // Visible tout de suite, sans attendre la relecture de la file.
      client.setQueryData<QueuedChange[]>(['hud-changes', id, token], (old) => [...(old ?? []), ...sent]);
      client.invalidateQueries({ queryKey: ['hud-changes', id] });
    },
  });
  const cancel = useMutation({
    mutationFn: (changeId: string) => cancelChange(id, token!, changeId),
    onSettled: () => client.invalidateQueries({ queryKey: ['hud-changes', id] }),
  });
  return { hud, changes, send, cancel, pending };
}

const KIND_LABELS: Record<QueuedChange['kind'], string> = {
  layout: 'Disposition',
  activate: 'Changement de disposition',
  hotbars: 'Barres d’actions',
};

function describe(change: QueuedChange): string {
  const body = change.change;
  if (body.kind === 'layout') return `${KIND_LABELS.layout} ${body.layout + 1} · ${body.elements.length} élément(s)`;
  if (body.kind === 'activate') return `Activer la disposition ${body.layout + 1}`;
  return `${KIND_LABELS.hotbars} · ${body.slots.length} case(s)`;
}

/** Dernières modifications envoyées, avec leur état. */
export function ChangeList({
  changes,
  kinds,
  onCancel,
}: {
  changes: QueuedChange[] | undefined;
  kinds: QueuedChange['kind'][];
  onCancel: (id: string) => void;
}) {
  const theme = useTheme();
  const shown = (changes ?? []).filter((c) => kinds.includes(c.kind)).slice(-5).reverse();
  if (shown.length === 0) return null;
  return (
    <Card>
      <ThemedText type="smallBold">Envois au jeu</ThemedText>
      {shown.map((c) => {
        const tone = c.status === 'applied' ? 'up' : c.status === 'failed' ? 'down' : c.status === 'pending' ? 'accent' : 'neutral';
        return (
          <View key={c.id} style={styles.row}>
            <View style={styles.text}>
              <ThemedText type="small" numberOfLines={1}>
                {describe(c)}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
                {c.status === 'pending'
                  ? `Envoyée ${formatAgo(Date.parse(c.createdAt))}. Le jeu l’applique hors combat, ou à ta prochaine connexion.`
                  : (c.message ?? formatAgo(Date.parse(c.doneAt ?? c.createdAt)))}
              </ThemedText>
            </View>
            <View style={styles.side}>
              <Badge label={STATUS_LABELS[c.status]} tone={tone} />
              {c.status === 'pending' ? (
                <Pressable accessibilityRole="button" onPress={() => onCancel(c.id)} hitSlop={8}>
                  <ThemedText type="small" style={{ color: theme.danger }}>
                    Annuler
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  text: { flex: 1, minWidth: 0 },
  side: { alignItems: 'flex-end', gap: Spacing.one },
});
