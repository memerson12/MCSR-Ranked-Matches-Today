const axolotls = [
  {
    name: "axoDance",
    chance: 0.305833,
  },
  {
    name: "axoDance2",
    chance: 0.305833,
  },
  {
    name: "axoDance3",
    chance: 0.305833,
  },
  {
    name: "axoDance4",
    chance: 0.0825,
  },
  {
    name: "RAREAxolotl",
    chance: 0.0008333333333,
  },
  {
    name: "SECRETAxolotl",
    chance: 0.0001,
  },
];

function pickAxolotl(axolotls) {
  // Calculate the total sum of chances
  const totalChance = axolotls.reduce(
    (sum, axolotl) => sum + axolotl.chance,
    0
  );

  // Generate a random number between 0 and totalChance
  const randomChance = Math.random() * totalChance;

  // Iterate through the array to find where the randomChance falls
  let cumulativeChance = 0;
  for (const axolotl of axolotls) {
    cumulativeChance += axolotl.chance;
    if (randomChance <= cumulativeChance) {
      return axolotl.name;
    }
  }

  return {
    name: "impossibleAxolotl",
    chance: 0,
  };
}

export default async function handler(req, res) {
  const axolotl = pickAxolotl(axolotls);

  res.status(200).send(axolotl);
}
