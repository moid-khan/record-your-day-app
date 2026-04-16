import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusPill } from '../../features/recording/components/StatusPill';
import { colors, spacing } from '../../theme';
import { scaleFont } from '../../theme/scale';

export function RecordingHubScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Recording Stack</Text>
        <Text style={styles.subtitle}>
          Structured entry point for Video, Voice, and Role-Play flows with hands detection and
          keyword start.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Runtime Readiness</Text>
          <View style={styles.row}>
            <StatusPill label="Hands model" status="idle" />
            <StatusPill label="Keyword" status="idle" />
          </View>
          <Text style={styles.helper}>
            Add the MediaPipe Hands TFLite model to `assets/models/hand-model.tflite` and a Vosk
            model folder (e.g. `model-small-en-us`) under `assets/`, then wire them into the
            recording screens.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Flows</Text>
          <Text style={styles.bullet}>• Video tasks: hands overlay + start keyword + FPS checks</Text>
          <Text style={styles.bullet}>• Voice tasks: keyword start + waveform + upload</Text>
          <Text style={styles.bullet}>
            • Role-Play: timed audio cues + video overlay + summary/payout state
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Next Steps</Text>
          <Text style={styles.bullet}>• Wire `useHandDetector` with the bundled TFLite model</Text>
          <Text style={styles.bullet}>• Wire `useStartKeyword` with the Vosk model folder</Text>
          <Text style={styles.bullet}>• Add recording screens that consume the hooks and overlays</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
    paddingTop: spacing.xl,
  },
  title: {
    fontSize: scaleFont(24),
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: scaleFont(15),
    color: colors.subduedText,
    marginTop: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: 16,
    shadowColor: colors.text,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: scaleFont(17),
    fontWeight: '700',
    color: colors.text,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  helper: {
    fontSize: scaleFont(13),
    color: colors.subduedText,
    marginTop: spacing.xs,
  },
  bullet: {
    fontSize: scaleFont(14),
    color: colors.subduedText,
  },
});
