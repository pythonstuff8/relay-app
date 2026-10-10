import React, { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { ExternalLink, Settings as SettingsIcon } from 'lucide-react-native';
import { ScreenHeader } from '../components/ScreenHeader';
import { Colors, Typography } from '../constants/theme';
import { Links } from '../constants/links';
import { useLanguage } from '../context/LanguageContext';
import { useBridge } from '../context/BridgeContext';
import { SUPPORTED_LANGUAGES } from '../utils/languages';
import { parseKeywords } from '../utils/keywords';

function LinkRow({ label, url, hint }: { label: string; url: string; hint: string }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => Linking.openURL(url)}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <Text style={styles.rowText}>{label}</Text>
      <ExternalLink color={Colors.textSubtle} size={20} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { langIndex, setLangIndex, prefs, updatePrefs } = useLanguage();
  const [keywordDraft, setKeywordDraft] = useState(prefs.alertKeywords.join(', '));

  useEffect(() => {
    setKeywordDraft(prefs.alertKeywords.join(', '));
  }, [prefs.alertKeywords]);

  const saveKeywords = () => {
    const keywords = parseKeywords(keywordDraft);
    updatePrefs({ alertKeywords: keywords });
    setKeywordDraft(keywords.join(', '));
    Haptics.selectionAsync();
  };
  const { pairing, desktopName, forget } = useBridge();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Settings" icon={SettingsIcon} />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Text style={styles.section} accessibilityRole="header">Language</Text>
        <View style={styles.chips}>
          {SUPPORTED_LANGUAGES.map((lang, index) => {
            const selected = index === langIndex;
            return (
              <Pressable
                key={lang.name}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setLangIndex(index);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={lang.name}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{lang.name}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>Used for captions, spoken answers, and Read Aloud.</Text>

        <Text style={styles.section} accessibilityRole="header">Name Alert</Text>
        <TextInput
          style={styles.input}
          value={keywordDraft}
          onChangeText={setKeywordDraft}
          onEndEditing={saveKeywords}
          onSubmitEditing={saveKeywords}
          placeholder="Your name, nickname"
          placeholderTextColor={Colors.textSubtle}
          autoCorrect={false}
          returnKeyType="done"
          accessibilityLabel="Name Alert words, separated by commas"
        />
        <Text style={styles.hint}>
          When these words are said, Relay vibrates and highlights the caption. Separate words with commas.
        </Text>

        <Text style={styles.section} accessibilityRole="header">Paired computer</Text>
        {pairing ? (
          <View style={styles.card}>
            <Text style={styles.rowText}>{desktopName || pairing.name}</Text>
            <Text style={styles.hint}>{`${pairing.host}:${pairing.port}`}</Text>
            <Pressable
              style={styles.dangerBtn}
              onPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                forget();
              }}
              accessibilityRole="button"
              accessibilityLabel="Forget this computer"
            >
              <Text style={styles.dangerText}>Forget this computer</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.hint}>No computer paired. Use Connect to Computer on the home screen.</Text>
        )}

        <Text style={styles.section} accessibilityRole="header">Help and privacy</Text>
        <LinkRow label="Support" url={Links.support} hint="Opens the Relay support page" />
        <LinkRow label="Privacy Policy" url={Links.privacy} hint="Opens the privacy policy" />
        <LinkRow label="Terms of Use" url={Links.terms} hint="Opens the terms of use" />
        <LinkRow label="Report an AI response" url={Links.reportAiResponse} hint="Report a harmful or wrong AI answer" />
        <LinkRow label="Get Relay for your computer" url={Links.desktopDownload} hint="Opens the desktop download page" />

        <Text style={styles.footer}>{`Relay ${version}`}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 16 },
  section: {
    color: Colors.textSubtle,
    fontSize: Typography.sizes.caption,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 24,
    marginBottom: 10,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: Colors.glassSecondary,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  chipSelected: { backgroundColor: Colors.white, borderColor: Colors.white },
  chipText: { color: Colors.white, fontSize: Typography.sizes.body, fontWeight: '600' },
  chipTextSelected: { color: Colors.onAccent },
  input: {
    height: 56,
    borderRadius: 16,
    paddingHorizontal: 18,
    color: Colors.white,
    fontSize: Typography.sizes.body,
    backgroundColor: Colors.glassSecondary,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  hint: { color: Colors.textSubtle, fontSize: Typography.sizes.body, marginTop: 8, lineHeight: 22 },
  card: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: Colors.glassSecondary,
    borderWidth: 1,
    borderColor: Colors.borderGlassSubtle,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: Colors.glassSecondary,
    marginBottom: 10,
  },
  rowPressed: { backgroundColor: Colors.glassPrimary },
  rowText: { color: Colors.white, fontSize: Typography.sizes.headline, fontWeight: '600' },
  dangerBtn: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.error,
    alignItems: 'center',
  },
  dangerText: { color: Colors.error, fontSize: Typography.sizes.headline, fontWeight: '700' },
  footer: { color: Colors.textSubtle, textAlign: 'center', marginTop: 28, fontSize: Typography.sizes.caption },
});
