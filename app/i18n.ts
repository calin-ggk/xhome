import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import ro from './locales/ro';

export const LANG_KEY = 'lang';

i18n.use(initReactI18next).init({
  lng:           'en',
  fallbackLng:   'en',
  resources:     { en: { translation: en }, ro: { translation: ro } },
  interpolation: { escapeValue: false },
});

export default i18n;
