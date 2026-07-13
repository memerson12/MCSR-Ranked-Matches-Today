// Commands are kept separate from the UI so new commands and bot variants can
// be added without changing the page rendering code. {{username}} is replaced
// with the Minecraft username entered on the page.
window.COMMAND_CATALOG = [
  {
    id: "mcsr-today",
    category: "Ranked",
    name: "Stream stats",
    trigger: "!today",
    description: "Ranked Elo change and record since the stream started.",
    example:
      "YourChannel's stats since stream start - Elo: +42 | Record: 4 W - 1 L - 0 D",
    commands: {
      fossabot:
        "$(eval r=$(customapi https://mcsr-stats.memerson.xyz/api/matches?timeframe=$(urlencode $(uptime))&username={{username}}); r['error'] ? `${r['error']}` : `$(channel.display_name)'s stats since stream start - Elo: ${r['totalEloChange']} | Record: ${r['wonMatchesCount']} W - ${r['lossMatchesCount']} L - ${r['drawCount']} D`)",
    },
  },
  {
    id: "mcsr-weekly-race",
    category: "Ranked",
    name: "Weekly race",
    trigger: "!weekly",
    description:
      "Your position and progress in the current MCSR Ranked weekly race.",
    example: "PB: 12:34.567 - WR: 08:42.123 by RunnerOne",
    commands: {
      fossabot:
        "$(eval r=$(customapi https://mcsrranked.com/api/weekly-race/); tUName='$(channel.display_name)'; mcUName='{{username}}'; $(customapi https://pastebin.com/raw/YhecbnTp))",
    },
  },
  {
    id: "draftout-today",
    category: "Draftout",
    name: "Stream stats",
    trigger: "!today",
    description: "Draftout Elo change and record since the stream started.",
    example:
      "YourChannel's Draftout stats since stream start - Elo: +18 | Record: 3 W - 1 L - 0 D",
    commands: {
      fossabot:
        "$(eval r=$(customapi https://mcsr-stats.memerson.xyz/api/draftout?timeframe=$(urlencode $(uptime))&username={{username}}); r['error'] ? `${r['error']}` : `$(channel.display_name)'s Draftout stats since stream start - Elo: ${r['totalEloChange']} | Record: ${r['wonMatchesCount']} W - ${r['lossMatchesCount']} L - ${r['drawCount']} D`)",
    },
  },
  {
    id: "draftout-winstreak",
    category: "Draftout",
    name: "Winstreak",
    trigger: "!ws",
    description: "Your current and peak Draftout winstreak.",
    example: "Current Winstreak: 3 | Peak: 8",
    commands: {
      fossabot:
        '$(eval "r=$(customapi https://mcsr-stats.memerson.xyz/api/draftout/winstreak?username={{username}}); r.error ? r.error : `Current Winstreak: ${r.currentWinstreak} | Peak: ${r.peakWinstreak}`")',
    },
  },
  {
    id: "draftout-leaderboard",
    category: "Draftout",
    name: "Leaderboard",
    trigger: "!lb",
    description: "The top three players on the Draftout Elo leaderboard.",
    example:
      "Draftout top 3: #1 PlayerOne - Guardian - 1820 Elo | #2 PlayerTwo - Master - 1794 Elo | #3 PlayerThree - Master - 1761 Elo",
    commands: {
      fossabot:
        "$(eval r=$(customapi https://mcsr-stats.memerson.xyz/api/draftout/leaderboard?top=3); `Draftout top 3: #${r[0]['placement']} ${r[0]['username']} - ${r[0]['rank']} - ${r[0]['elo']} Elo | #${r[1]['placement']} ${r[1]['username']} - ${r[1]['rank']} - ${r[1]['elo']} Elo | #${r[2]['placement']} ${r[2]['username']} - ${r[2]['rank']} - ${r[2]['elo']} Elo`)",
    },
  },
  {
    id: "world-records",
    category: "Misc",
    name: "World records",
    trigger: "!wr",
    description:
      "Choose which current Minecraft speedrun world records to show.",
    example:
      "1.16 RSG Any% - 6:50.321 by RunnerOne | 1.16 RSG AA - 1:58:42 by RunnerTwo",
    sources: [
      {
        label: "Any% RSG sheet",
        url: "https://docs.google.com/spreadsheets/d/10seM-w8FxJ15NOzP9ohpecuTSlvqfxvfMDIqw_NjvdA/edit?gid=2055147762#gid=2055147762",
      },
      {
        label: "All Advancements sheet",
        url: "https://docs.google.com/spreadsheets/d/107ijqjELTQQ29KW4phUmtvYFTX9-pfHsjb18TKoWACk/edit",
      },
    ],
    records: [
      {
        id: "any-116",
        key: "any%_1.16+_rsg",
        label: "1.16+ RSG Any%",
        sample: "6:50.321 by RunnerOne",
        default: true,
      },
      {
        id: "any-18",
        key: "any%_1.8_rsg",
        label: "1.8 RSG Any%",
        sample: "9:42.012 by RunnerTwo",
      },
      {
        id: "any-113",
        key: "any%_1.13-1.15_rsg",
        label: "1.13–1.15 RSG Any%",
        sample: "12:18.450 by RunnerThree",
      },
      {
        id: "aa-116",
        key: "aa_1.16_rsg",
        label: "1.16 RSG AA",
        sample: "1:58:42 by RunnerFour",
        default: true,
      },
    ],
    commands: {
      fossabot:
        "$(eval r=$(customapi https://mcsr-stats.memerson.xyz/api/world_records); `1.16 RSG Any% - ${r['any%_1.16+_rsg']['igt']} by ${r['any%_1.16+_rsg']['runner']} | 1.16 RSG AA - ${r['aa_1.16_rsg']['igt']} by ${r['aa_1.16_rsg']['runner']}`)",
    },
  },
  {
    id: "axolotl",
    category: "Misc",
    name: "Axolotl roll",
    trigger: "!axolotl",
    description: "Roll a random axolotl emote and add it to the Axolotl stats.",
    example: "axoDance3",
    commands: {
      fossabot: "$(customapi https://mcsr-stats.memerson.xyz/api/axolotls)",
    },
  },
];
