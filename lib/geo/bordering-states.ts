// Land borders, including four-corner contacts. DC is included for local search.
// Store each border once and derive both directions to keep expansion symmetric.
const BORDERS = [
  "AL:FL,GA,MS,TN",
  "AZ:CA,CO,NM,NV,UT",
  "AR:LA,MO,MS,OK,TN,TX",
  "CA:NV,OR",
  "CO:KS,NE,NM,OK,UT,WY",
  "CT:MA,NY,RI",
  "DE:MD,NJ,PA",
  "DC:MD,VA",
  "FL:GA",
  "GA:NC,SC,TN",
  "ID:MT,NV,OR,UT,WA,WY",
  "IL:IA,IN,KY,MO,WI",
  "IN:KY,MI,OH",
  "IA:MN,MO,NE,SD,WI",
  "KS:MO,NE,OK",
  "KY:MO,OH,TN,VA,WV",
  "LA:MS,TX",
  "ME:NH",
  "MD:PA,VA,WV",
  "MA:NH,NY,RI,VT",
  "MI:OH,WI",
  "MN:ND,SD,WI",
  "MS:TN",
  "MO:NE,OK,TN",
  "MT:ND,SD,WY",
  "NE:SD,WY",
  "NV:OR,UT",
  "NH:VT",
  "NJ:NY,PA",
  "NM:OK,TX,UT",
  "NY:PA,VT",
  "NC:SC,TN,VA",
  "ND:SD",
  "OH:PA,WV",
  "OK:TX",
  "OR:WA",
  "PA:WV",
  "SD:WY",
  "TN:VA",
  "UT:WY",
  "VA:WV",
] as const;

export function surroundingStates(state: string): string[] {
  const code = state.toUpperCase();
  const neighbors = new Set([code]);
  for (const entry of BORDERS) {
    const [from, list] = entry.split(":");
    const targets = list.split(",");
    if (from === code) for (const target of targets) neighbors.add(target);
    if (targets.includes(code)) neighbors.add(from);
  }
  return [
    code,
    ...Array.from(neighbors)
      .filter((value) => value !== code)
      .sort(),
  ];
}
