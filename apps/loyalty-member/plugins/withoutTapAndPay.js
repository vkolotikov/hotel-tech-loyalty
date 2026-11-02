// stripe-react-native 0.81 keeps Stripe's push provisioning (adding a card to Google Wallet, which this app never
// does) as a compileOnly dependency, and that library lists Google's Tap and Pay SDK as a runtime dependency. Tap and
// Pay is distributed privately by Google, so the release build's lint step, which resolves every dependency's runtime
// files to look for lint rules, stops with "Could not find com.google.android.gms:play-services-tapandpay". Nothing
// packages either library, so the app is unchanged by never resolving it.
const { withProjectBuildGradle } = require('expo/config-plugins');

const MARK = '// withoutTapAndPay';
const BLOCK = `
${MARK}
allprojects {
  configurations.configureEach {
    exclude group: 'com.google.android.gms', module: 'play-services-tapandpay'
  }
}
`;

module.exports = function withoutTapAndPay(config) {
  return withProjectBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error('withoutTapAndPay expects a Groovy android/build.gradle');
    }
    if (!mod.modResults.contents.includes(MARK)) {
      mod.modResults.contents += BLOCK;
    }
    return mod;
  });
};
