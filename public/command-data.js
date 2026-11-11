// Commands are kept separate from the UI so new commands and bot variants can
// be added without changing the page rendering code. {{username}} is replaced
// with the Minecraft username entered on the page.
window.COMMAND_CATALOG = [
  {
    id: "mcsr-today",
    api: {
      "endpoint": "/api/matches",
      "parameters": [
        {
          "name": "username",
          "requirement": "Required",
          "description": "Minecraft username.",
          "default": "{{username}}"
        },
        {
          "name": "timeframe",
          "requirement": "Optional",
          "description": "Stream uptime, e.g. '1 hour and 5 minutes'. Without it, session counts are zero; current/overall stats are still returned.",
          "default": "12 hours"
        }
      ],
      "note": "The bot supplies stream uptime automatically. The request below uses an editable sample timeframe."
    },
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
    api: {
      "endpoint": "https://mcsrranked.com/api/weekly-race/",
      "parameters": [],
      "note": "This command reads the public MCSR Ranked weekly-race API directly. The Minecraft username is used by the command’s formatting script, not sent as an API parameter."
    },
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
    id: "aa-today",
    api: {
      "endpoint": "/api/aa/stats",
      "parameters": [
        {
          "name": "username",
          "requirement": "Username or UUID",
          "description": "Minecraft username.",
          "default": "{{username}}"
        },
        {
          "name": "uuid",
          "requirement": "Username or UUID",
          "description": "Minecraft UUID, compact or hyphenated. When provided, it takes precedence over username."
        },
        {
          "name": "timeframe",
          "requirement": "Optional",
          "description": "Stream uptime, e.g. '1 hour and 5 minutes'. Defaults to the last 24 hours when omitted.",
          "default": "12 hours"
        }
      ],
      "note": "Times are in-game milliseconds; formatted times use m:ss or None. The session window uses Paceman run update timestamps. The bot supplies stream uptime automatically."
    },
    category: "AA",
    name: "Stream stats",
    trigger: "!today",
    description: "AA nether entries, elytras, finished runs, and fastest/latest elytra times since stream start.",
    outputPrefix: "",
    outputSeparator: " - ",
    parts: [
      {
        "key": "nethers",
        "label": "Nethers",
        "sample": "20",
        "default": true
      },
      {
        "key": "elytras",
        "label": "Elytras",
        "sample": "4",
        "default": true
      },
      {
        "key": "finished",
        "label": "Finished",
        "sample": "1",
        "default": true
      },
      {
        "key": "fastestElytraTimeFormatted",
        "label": "Fastest Elytra",
        "sample": "14:36",
        "default": true
      },
      {
        "key": "latestElytraTimeFormatted",
        "label": "Latest Elytra",
        "sample": "15:37",
        "default": true
      }
    ],
  },
  {
    id: "aa-pbs",
    api: {
      "endpoint": "/api/aa/pbs",
      "parameters": [
        {
          "name": "username",
          "requirement": "Username or UUID",
          "description": "Minecraft username.",
          "default": "{{username}}"
        },
        {
          "name": "uuid",
          "requirement": "Username or UUID",
          "description": "Minecraft UUID, compact or hyphenated. When provided, it takes precedence over username."
        }
      ],
      "note": "Lifetime PBs from recorded AA history, cached for five minutes. timeframe is not supported. Missing PBs are null / None; completion times can use h:mm:ss."
    },
    category: "AA",
    name: "Personal bests",
    trigger: "!pb",
    description: "Lifetime AA personal bests for each split tracked by Paceman. Unreached splits show None.",
    outputPrefix: "AA PBs - ",
    outputSeparator: " | ",
    parts: [
      {
        "key": "fastestNetherTimeFormatted",
        "label": "Nether",
        "sample": "1:39",
        "default": true
      },
      {
        "key": "fastestBastionTimeFormatted",
        "label": "Bastion",
        "sample": "2:21",
        "default": true
      },
      {
        "key": "fastestFortressTimeFormatted",
        "label": "Fortress",
        "sample": "2:20",
        "default": true
      },
      {
        "key": "fastestStrongholdTimeFormatted",
        "label": "Stronghold",
        "sample": "7:42",
        "default": true
      },
      {
        "key": "fastestEndTimeFormatted",
        "label": "End",
        "sample": "8:04",
        "default": true
      },
      {
        "key": "fastestElytraTimeFormatted",
        "label": "Elytra",
        "sample": "12:16",
        "default": true
      },
      {
        "key": "fastestEndExitTimeFormatted",
        "label": "End Exit",
        "sample": "19:54",
        "default": true
      },
      {
        "key": "fastestCompletionTimeFormatted",
        "label": "Completion",
        "sample": "2:05:48",
        "default": true
      }
    ],
  },
  {
    id: "draftout-today",
    api: {
      "endpoint": "/api/draftout",
      "parameters": [
        {
          "name": "username",
          "requirement": "Required",
          "description": "Draftout username.",
          "default": "{{username}}"
        },
        {
          "name": "timeframe",
          "requirement": "Optional",
          "description": "Stream uptime, e.g. '1 hour and 5 minutes'. Without it, session counts are zero; current/overall stats are still returned.",
          "default": "12 hours"
        }
      ],
      "note": "The bot supplies stream uptime automatically. Without timeframe, session match counts are zero."
    },
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
    api: {
      "endpoint": "/api/draftout/winstreak",
      "parameters": [
        {
          "name": "username",
          "requirement": "Required",
          "description": "Draftout username.",
          "default": "{{username}}"
        }
      ]
    },
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
    api: {
      "endpoint": "/api/draftout/leaderboard",
      "parameters": [
        {
          "name": "top",
          "requirement": "Optional",
          "description": "Positive integer. Omit to return the full leaderboard; the chat command uses 3.",
          "default": "3"
        }
      ]
    },
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
    api: {
      "endpoint": "/api/world_records",
      "parameters": [],
      "note": "Always returns all record categories. The checkboxes above only change which records appear in the chat command."
    },
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
    api: {
      "endpoint": "/api/axolotls",
      "parameters": [],
      "sideEffect": true,
      "note": "Returns plain text, not JSON. Every request records one roll. Bot headers identify the user/channel: x-fossabot-message-userlogin and x-fossabot-channellogin, or Nightbot-User (displayName) and Nightbot-Channel (name). Browser requests without those headers are recorded as anonymous."
    },
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
