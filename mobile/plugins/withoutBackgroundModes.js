const { withInfoPlist } = require('expo/config-plugins');

// @saltmango/expo-audio-stream adds the iOS `audio` background mode, but Relay
// only records while a screen is open, so App Review would flag it as unused.
module.exports = function withoutBackgroundModes(config) {
  return withInfoPlist(config, (cfg) => {
    delete cfg.modResults.UIBackgroundModes;
    return cfg;
  });
};
