import { colors } from './colors';
import { scaleFont } from './scale';

export const typography = {
  title: {
    fontSize: scaleFont(22),
    fontWeight: '700' as const,
    color: colors.text,
  },
  subtitle: {
    fontSize: scaleFont(14),
    fontWeight: '500' as const,
    color: colors.subduedText,
  },
  body: {
    fontSize: scaleFont(15),
    fontWeight: '500' as const,
    color: colors.text,
  },
  caption: {
    fontSize: scaleFont(13),
    fontWeight: '500' as const,
    color: colors.subduedText,
  },
};
