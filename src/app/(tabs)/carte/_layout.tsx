/** Onglet Carte : la carte, et l'atlas par-dessus (la barre d'onglets reste visible). */
import { Stack } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';

export default function MapTabLayout() {
  return (
    // Sur le web, la barre d'onglets flotte en haut de l'écran : la barre de titre se place dessous.
    <View style={[styles.fill, Platform.OS === 'web' && styles.web]}>
      <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="index" options={{ title: 'Carte' }} />
        <Stack.Screen name="atlas" options={{ title: 'Atlas' }} />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  web: { paddingTop: 64 },
});
