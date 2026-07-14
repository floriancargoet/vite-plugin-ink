module.exports = {
  interactive: true,
  // Wait 24h before suggesting an update
  cooldown: 1,
  format: [
    "group",
    "repo",
    "installedVersion",
    "time",
    // This own doesn't work in group mode but let's include it in case it work in the future
    "ownerChanged",
  ],
};
