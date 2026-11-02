const fs = require('node:fs');
const path = require('node:path');
const { expo } = require('./app.json');
const { languages } = require('./store/listing.json');

const locales = { en: 'en-GB', ru: 'ru', de: 'de-DE', fr: 'fr-FR', es: 'es-ES' };
const screenshots = (folder) => fs.readdirSync(path.join(__dirname, 'store/screenshots', folder))
  .filter((name) => name.endsWith('.png'))
  .sort()
  .map((name) => `./store/screenshots/${folder}/${name}`);

// Source text remains in listing.json. Review credentials are entered by the owner in the console.
module.exports = {
  configVersion: 0,
  apple: {
    version: expo.version,
    copyright: '2026 FDS Cards Ltd.',
    release: { automaticRelease: false },
    info: Object.fromEntries(Object.entries(languages).map(([language, listing]) => [
      locales[language],
      {
        title: listing.appStore.name,
        subtitle: listing.appStore.subtitle,
        description: listing.description,
        promoText: listing.appStore.promotionalText,
        keywords: listing.appStore.keywords.split(','),
        ...(listing.appStore.whatsNew ? { releaseNotes: listing.appStore.whatsNew } : {}),
        marketingUrl: 'https://hexa-tech.uk',
        supportUrl: 'https://hexa-tech.uk/about-us',
        privacyPolicyUrl: 'https://app.hexa-tech.uk/privacy',
        privacyChoicesUrl: 'https://app.hexa-tech.uk/data-deletion',
        ...(language === 'en' ? {
          screenshots: {
            APP_IPHONE_67: screenshots('ios-6.9'),
            APP_IPAD_PRO_3GEN_129: screenshots('ipad-13'),
          },
        } : {}),
      },
    ])),
  },
};
