import { useTranslation } from 'react-i18next';
import { langToLocale, fmtAmount, fmtDate, fmtMonth, fmtMonthLong, fmtShortMonth } from '~/lib/format';

export function useFormat() {
  const { i18n } = useTranslation();
  const locale = langToLocale(i18n.language);
  return {
    locale,
    fmtAmount:     (cents: number, dp = 2) => fmtAmount(cents, dp, locale),
    fmtDate:       (isoDate: string)        => fmtDate(isoDate, locale),
    fmtMonth:      (ym: string)             => fmtMonth(ym, locale),
    fmtMonthLong:  (ym: string)             => fmtMonthLong(ym, locale),
    fmtShortMonth: (ym: string)             => fmtShortMonth(ym, locale),
  };
}
