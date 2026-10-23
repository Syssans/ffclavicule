/** Connexion du téléphone aux données privées d'un personnage, avec le code affiché par le plugin. */
import { useMutation } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { normalizeCode, pairDevice } from '@/api/private';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorBox, Input, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAppStore } from '@/store/app-store';

export default function ConnectScreen() {
  const { name } = useLocalSearchParams<{ id?: string; name?: string }>();
  const [code, setCode] = useState('');
  const setPrivateLink = useAppStore((s) => s.setPrivateLink);
  const saveCharacter = useAppStore((s) => s.saveCharacter);
  const characters = useAppStore((s) => s.characters);

  const connect = useMutation({
    mutationFn: () => pairDevice(code),
    onSuccess: (result) => {
      setPrivateLink(result.characterId, { token: result.token, deviceId: result.deviceId, linkedAt: result.linkedAt });
      // Le personnage connecté rejoint la liste des personnages suivis.
      if (!characters.some((c) => c.id === result.characterId)) {
        saveCharacter({ id: result.characterId, name: result.name ?? `Personnage ${result.characterId}`, world: result.world, dataCenter: null, avatar: null });
      }
      router.replace({ pathname: '/character/[id]', params: { id: String(result.characterId) } });
    },
  });

  const digits = normalizeCode(code);
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Connecter mon personnage' }} />
      <ThemedText type="subtitle">{name ? `Connecter ${name}` : 'Connecter mon personnage'}</ThemedText>
      <Card>
        <ThemedText type="smallBold">1. En jeu, tape /clavicule</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Section « Appli mobile », bouton « Connecter un téléphone » : un code à 6 chiffres s’affiche.
        </ThemedText>
        <ThemedText type="smallBold">2. Saisis-le ici</ThemedText>
        <Input
          value={code}
          onChangeText={(t) => setCode(normalizeCode(t))}
          placeholder="123 456"
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={7}
          style={styles.code}
          accessibilityLabel="Code à 6 chiffres"
        />
        <Button
          label={connect.isPending ? 'Connexion…' : 'Connecter'}
          onPress={() => connect.mutate()}
          disabled={digits.length !== 6 || connect.isPending}
        />
      </Card>
      {connect.error ? <ErrorBox error={connect.error} /> : null}
      <View style={styles.note}>
        <ThemedText type="small" themeColor="textSecondary">
          Aucun mot de passe n’est demandé : le code, valable 10 minutes et une seule fois, prouve que tu es devant le jeu.
          Ton inventaire, tes servants et ton courrier ne seront visibles que sur ce téléphone et ceux que tu connectes.
        </ThemedText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  code: { fontSize: 28, letterSpacing: 6, textAlign: 'center', minHeight: 56 },
  note: { paddingHorizontal: Spacing.two },
});
