import express from "express";
import fetch from "node-fetch";
import "dotenv/config";

const router = express.Router();

const rsgWrs = [
  {
    spreadsheetId: "10seM-w8FxJ15NOzP9ohpecuTSlvqfxvfMDIqw_NjvdA",
    records: [
      {
        sheetName: "1.16+ RSG",
        dataRange: "B3:G3",
        name: "any%_1.16+_rsg",
        mappings: {
          date: 5,
          runner: 0,
          igt: 1,
          status: 2,
        },
      },
      {
        sheetName: "1.8 RSG",
        dataRange: "B3:D3",
        name: "any%_1.8_rsg",
        mappings: {
          runner: 0,
          igt: 1,
          status: 2,
        },
      },
      {
        sheetName: "1.13-1.15 RSG",
        dataRange: "B3:D3",
        name: "any%_1.13-1.15_rsg",
        mappings: {
          runner: 0,
          igt: 1,
          status: 2,
        },
      },
    ],
  },
  {
    spreadsheetId: "107ijqjELTQQ29KW4phUmtvYFTX9-pfHsjb18TKoWACk",
    records: [
      {
        sheetName: "Leaderboard (+Unverifiable)",
        dataRange: "B3:E3",
        name: "aa_1.16_rsg",
        mappings: {
          date: 0,
          runner: 1,
          igt: 2,
          status: 3,
        },
      },
    ],
  },
];

function convertSerialDate(serialDate) {
  if (!serialDate) return;
  const date = new Date((serialDate - 25569) * 86400 * 1000);
  return date.toLocaleDateString("en-US");
}

function convertSerialTime(serialTime) {
  if (typeof serialTime == "string") return serialTime;
  const totalSeconds = Math.floor(serialTime * 86400);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${minutes}:${seconds}s`;
}

async function batchGet(spreadsheetId, ranges) {
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet`
  );
  url.searchParams.append("valueRenderOption", "UNFORMATTED_VALUE");
  url.searchParams.append("key", process.env.SHEETS_KEY);
  for (let range of ranges) {
    url.searchParams.append("ranges", range);
  }

  const res = await fetch(url);
  return await res.json();
}

router.get("/", async (req, res) => {
  const result = {};
  for (let sheet of rsgWrs) {
    const ranges = sheet.records.map((r) => `${r.sheetName}!${r.dataRange}`);
    const data = (await batchGet(sheet.spreadsheetId, ranges)).valueRanges;

    for (let i = 0; i < ranges.length; i++) {
      const wr = data[i].values[0];
      const mappings = sheet.records[i].mappings;
      const name = sheet.records[i].name;
      result[name] = {
        runner: wr[mappings.runner],
        igt: convertSerialTime(wr[mappings.igt]),
        date: convertSerialDate(wr[mappings.date]) ?? "Unknown",
        status: wr[mappings.status] ?? "Unknown",
      };
    }
  }
  res.status(200).json(result);
});

export default router;
