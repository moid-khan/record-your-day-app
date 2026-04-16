import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors, radii, spacing } from '../../../theme';
import { scaleFont } from '../../../theme/scale';

type SelectorOption = {
  label: string;
  value: string;
};

type Props = {
  visible: boolean;
  title: string;
  options: SelectorOption[];
  selectedValue: string;
  onClose: () => void;
  onSelect: (value: string) => void;
};

export function OptionSheet({
  visible,
  title,
  options,
  selectedValue,
  onClose,
  onSelect,
}: Props) {
  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.sheetOverlay}>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} />
        <View style={styles.sheetCard}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Icon name="x" size={18} color={colors.subduedText} />
            </Pressable>
          </View>
          <ScrollView>
            {options.map((option) => (
              <Pressable
                key={option.value || option.label}
                onPress={() => onSelect(option.value)}
                style={[
                  styles.sheetOption,
                  selectedValue === option.value && styles.sheetOptionSelected,
                ]}
              >
                <Text style={styles.sheetOptionLabel}>{option.label}</Text>
                {selectedValue === option.value ? (
                  <Icon name="check" size={18} color={colors.primary} />
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: '70%',
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    fontSize: scaleFont(16),
    fontWeight: '700',
    color: colors.text,
  },
  sheetOption: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetOptionSelected: {
    backgroundColor: colors.surfaceMuted,
  },
  sheetOptionLabel: {
    fontSize: scaleFont(16),
    color: colors.text,
    fontWeight: '600',
  },
});
