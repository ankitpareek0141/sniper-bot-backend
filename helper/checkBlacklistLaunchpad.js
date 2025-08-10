const blacklistedLaunchpad = [
  "believe",
  "jup-studio",
  "bags.fun",
  "moonshot",
  "bunt.fun",
  "dialect",
  "xcombinator",
  "met-dbc",
  "boop",
  "moonit",
  "ego",
  "aicraft",
  "dubdub",
  "sendshot",
  "trends.fun",
  "candle",
  "slerfpar",
  "nouns.fun",
  "daos.fun",
  "circus.fun",
  "time.fun",
  "revshare",
  "cults.fun",
  "cooking.city",
  "print.fun",
  "virtuals",
  "shout",
  "opinions.fun",
  "dealr.fun",
  "madness.fun",
  "oneshot.meme",
  "ethics",
];

export function isLaunchpadBlacklisted(launchpadName) {
    if (!launchpadName) return false;
    return blacklistedLaunchpad.includes(launchpadName.toLowerCase());
}