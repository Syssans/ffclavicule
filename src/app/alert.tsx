/** Créer ou modifier une alerte de prix : objet, serveur, seuil, qualité. */
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { getDataCenters, getPriceSummaries, getWorlds, regionLabel } from '@/api/universalis';
import { searchItems } from '@/api/xivapi';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Empty, ErrorBox, GameIcon, Input, Loading, Screen, Section, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useDebounced } from '@/hooks/use-debounced';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import { newAlertId, useNotificationStore, type PriceAlert } from '@/store/notification-store';
import { formatGil } from '@/utils/format';

interface ChosenItem {
  id: number;
  name: string;
  icon: string | null;
}

export default function AlertScreen() {
  const params = useLocalSearchParams<{ alertId?: string; itemId?: string; name?: string; icon?: string }>();
  const existing = useNotificationStore((s) => s.alerts.find((a) => a.id === params.alertId));
  const initialItem: ChosenItem | null = existing
    ? { id: existing.itemId, name: existing.itemName, icon: existing.icon }
    : params.itemId
      ? { id: Number(params.itemId), name: params.name ?? `Objet ${params.itemId}`, icon: params.icon ?? null }
      : null;
  const [item, setItem] = useState<ChosenItem | null>(initialItem);

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? 'Modifier l’alerte' : 'Nouvelle alerte' }} />
      {item ? <AlertForm item={item} existing={existing} onChangeItem={existing ? undefined : () => setItem(null)} /> : <ItemPicker onPick={setItem} />}
    </Screen>
  );
}

function ItemPicker({ onPick }: { onPick: (item: ChosenItem) => void }) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const query = useDebounced(text.trim(), 400);
  const results = useQuery({
    queryKey: ['xivapi', 'search', query],
    queryFn: () => searchItems(query, { marketableOnly: true }),
    enabled: query.length >= 2,
  });
  return (
    <>
      <Input value={text} onChangeText={setText} placeholder="Objet à surveiller" autoFocus accessibilityLabel="Chercher un objet" />
      {results.isFetching ? <Loading /> : null}
      {results.error ? <ErrorBox error={results.error} /> : null}
      {results.data?.length === 0 ? <Empty>Aucun objet vendable ne correspond.</Empty> : null}
      {results.data?.length ? (
        <Card style={styles.list}>
          {results.data.map((it, i) => (
            <Pressable
              key={it.id}
              accessibilityRole="button"
              onPress={() => onPick({ id: it.id, name: it.name, icon: it.icon })}
              style={({ pressed }) => [styles.result, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }, pressed && { opacity: 0.7 }]}>
              <GameIcon uri={it.icon} size={36} />
              <ThemedText numberOfLines={1} style={styles.flex}>
                {it.name}
              </ThemedText>
            </Pressable>
          ))}
        </Card>
      ) : null}
    </>
  );
}

function AlertForm({ item, existing, onChangeItem }: { item: ChosenItem; existing?: PriceAlert; onChangeItem?: () => void }) {
  const homeScope = useAppStore((s) => s.marketScope);
  const saveAlert = useNotificationStore((s) => s.saveAlert);
  const removeAlert = useNotificationStore((s) => s.removeAlert);
  const secret = useNotificationStore((s) => s.pushSecret);

  const [scope, setScope] = useState(existing?.scope ?? homeScope);
  const [condition, setCondition] = useState<PriceAlert['condition']>(existing?.condition ?? 'below');
  const [hq, setHq] = useState(existing?.hq ?? false);
  const [price, setPrice] = useState(existing ? String(existing.price) : '');

  const dataCenters = useQuery({ queryKey: ['universalis', 'data-centers'], queryFn: getDataCenters, staleTime: Infinity });
  const worlds = useQuery({ queryKey: ['universalis', 'worlds'], queryFn: getWorlds, staleTime: Infinity });
  const current = useQuery({
    queryKey: ['universalis', 'summary', scope, item.id],
    queryFn: () => getPriceSummaries(scope, [item.id]),
  });

  // Le serveur peut être un monde, un centre de données ou une région : on propose ceux autour du choix actuel.
  const worldName = new Map(worlds.data?.map((w) => [w.id, w.name]));
  const dc =
    dataCenters.data?.find((d) => d.name === homeScope) ?? dataCenters.data?.find((d) => d.worlds.some((id) => worldName.get(id) === homeScope));
  const scopes = dc
    ? [dc.region, dc.name, ...dc.worlds.map((id) => worldName.get(id)).filter((n): n is string => Boolean(n)).sort()]
    : [homeScope];
  if (!scopes.includes(scope)) scopes.unshift(scope);

  const amount = Number(price.replace(/\D/g, ''));
  const valid = amount > 0;
  const summary = current.data?.[0];
  const reference = summary?.minPrice ?? null;

  const save = () => {
    saveAlert({
      id: existing?.id ?? newAlertId(),
      itemId: item.id,
      itemName: item.name,
      icon: item.icon,
      scope,
      condition,
      price: amount,
      hq,
      enabled: existing?.enabled ?? true,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });
    // Première alerte : il reste à activer les notifications.
    if (!secret) router.replace('/notifications');
    else router.back();
  };

  return (
    <>
      <Card>
        <View style={styles.result}>
          <GameIcon uri={item.icon} size={48} />
          <ThemedText type="smallBold" style={styles.flex}>
            {item.name}
          </ThemedText>
          {onChangeItem ? <Chip label="Changer" onPress={onChangeItem} /> : null}
        </View>
        {current.isPending ? (
          <ThemedText type="small" themeColor="textSecondary">
            Prix actuel…
          </ThemedText>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            {reference
              ? `Actuellement : ${formatGil(reference)}${summary?.cheapestWorld ? ` sur ${summary.cheapestWorld}` : ''}`
              : 'Aucune vente en cours sur ce serveur.'}
          </ThemedText>
        )}
      </Card>

      <Section title="Prévenir quand le prix est">
        <Segmented
          options={[
            { value: 'below', label: 'Inférieur ou égal' },
            { value: 'above', label: 'Supérieur ou égal' },
          ]}
          value={condition}
          onChange={setCondition}
        />
        <Input value={price} onChangeText={(t) => setPrice(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="Prix en gils" accessibilityLabel="Seuil en gils" />
        {reference ? (
          <View style={styles.chips}>
            {(condition === 'below' ? [0.95, 0.9, 0.8, 0.7] : [1.1, 1.2, 1.5, 2]).map((f) => (
              <Chip key={f} label={`${f < 1 ? '-' : '+'}${Math.round(Math.abs(1 - f) * 100)} %`} onPress={() => setPrice(String(Math.round(reference * f)))} />
            ))}
          </View>
        ) : null}
        {valid ? (
          <ThemedText type="small" themeColor="textSecondary">
            Seuil : {formatGil(amount)}
          </ThemedText>
        ) : null}
      </Section>

      <Section title="Qualité">
        <Segmented
          options={[
            { value: 'all', label: 'Toutes' },
            { value: 'hq', label: 'HQ seulement' },
          ]}
          value={hq ? 'hq' : 'all'}
          onChange={(v) => setHq(v === 'hq')}
        />
      </Section>

      <Section title="Serveur">
        <View style={styles.chips}>
          {scopes.map((s) => (
            <Chip key={s} label={s === dc?.region ? regionLabel(s) : s} selected={s === scope} onPress={() => setScope(s)} />
          ))}
        </View>
      </Section>

      <Button label={existing ? 'Enregistrer' : 'Créer l’alerte'} onPress={save} disabled={!valid} />
      {existing ? (
        <Button
          label="Supprimer l’alerte"
          variant="danger"
          onPress={() => {
            removeAlert(existing.id);
            router.back();
          }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  list: { gap: 0, paddingVertical: Spacing.one },
  result: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
});
