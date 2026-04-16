import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { SurfaceCard } from '../../../components/SurfaceCard';
import { colors, radii, spacing } from '../../../theme';
import { scaleFont } from '../../../theme/scale';

export type RolePlayCue = {
  id?: string;
  atSeconds: number;
  text: string;
};

export type BountySite = {
  id: string;
  name: string;
};

// API response format
export type ApiBounty = {
  id: string;
  title: string;
  description: string;
  durationMinutes: number;
  payment: number;
  cvRules?: Record<string, unknown>;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  siteId?: string;
  taskType: 'video' | 'voice' | 'rolePlay';
  showWaveform?: boolean;
  rolePlayCues?: RolePlayCue[] | null;
  site?: BountySite;
};

// App-internal format (transformed from API)
export type BountyItem = {
  id: string;
  title: string;
  description: string;
  showWaveform?: boolean;
  rolePlayCues?: RolePlayCue[];
  amount: number; // Mapped from payment
  duration: string; // Formatted from durationMinutes
  durationMinutes?: number; // Keep original for calculations
  taskType: 'video' | 'voice' | 'rolePlay';
  site?: BountySite;
};

// Helper to transform API bounty to app format
export function transformApiBounty(api: ApiBounty): BountyItem {
  // For voice tasks, waveform is always shown
  const isVoiceTask = api.taskType === 'voice';

  return {
    id: api.id,
    title: api.title,
    description: api.description,
    showWaveform: isVoiceTask ? true : (api.showWaveform ?? false),
    rolePlayCues: api.rolePlayCues ?? undefined,
    amount: api.payment,
    duration: api.durationMinutes >= 60
      ? `${Math.floor(api.durationMinutes / 60)}h ${api.durationMinutes % 60}m`
      : `${api.durationMinutes} min`,
    durationMinutes: api.durationMinutes,
    taskType: api.taskType,
    site: api.site,
  };
}

type Props = {
  item: BountyItem;
  onAccept?: (item: BountyItem) => void;
};

export function BountyCard({ item, onAccept }: Props) {
  return (
    <SurfaceCard style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.amount}>${item.amount}</Text>
      </View>
      <Text style={styles.description}>{item.description}</Text>
      <View style={styles.metaRow}>
        <Icon name="clock" size={16} color={colors.subduedText} />
        <Text style={styles.metaText}>{item.duration}</Text>
      </View>
      <Pressable
        style={styles.acceptButton}
        onPress={() => onAccept?.(item)}
      >
        <Text style={styles.acceptText}>Accept Bounty</Text>
      </Pressable>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    padding: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: scaleFont(16),
    fontWeight: '700',
    color: colors.text,
    flex: 1,
    marginRight: spacing.sm,
  },
  amount: {
    fontSize: scaleFont(18),
    fontWeight: '700',
    color: colors.success,
  },
  description: {
    fontSize: scaleFont(14),
    color: colors.subduedText,
    marginBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  metaText: {
    fontSize: scaleFont(14),
    color: colors.subduedText,
  },
  acceptButton: {
    borderRadius: radii.xl,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  acceptText: {
    color: colors.surface,
    fontSize: scaleFont(15),
    fontWeight: '700',
  },
});
