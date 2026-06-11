// ============================================================
// The Gaffers — draft recap sender (final recaps baked in, no AI step)
//
//   1. Fill BREVO_API_KEY, SENDER, and each manager's email in RECIPIENTS.
//   2. node send-gaffers-recaps.mjs --dry     (prints everything, sends nothing)
//   3. node send-gaffers-recaps.mjs           (sends for real)
//
// No dependencies — needs Node 18+.
// ============================================================

const BREVO_API_KEY = process.env.BREVO_API_KEY || "xkeysib-PASTE_KEY_HERE";
const SENDER = { name: "The Gaffers", email: "draft@thegaffers.com" }; // your verified Brevo sender
const DRY_RUN = process.argv.includes("--dry");

// ---- fill in each manager's email ----
const RECIPIENTS = {
  "Jer":       "",
  "Dan":       "",
  "D'Ags":     "",
  "AL":        "",
  "Meme Team": "",
  "Curt":      "",   // your own — blank it if you don't want the email
  "Masumi":    "",
  "Chris":     "",
  "JB":        "",
};

const STANDINGS = [
  { rank: 1, name: "Jer",       pts: 54.1, grade: "A+" },
  { rank: 2, name: "Dan",       pts: 48.7, grade: "A"  },
  { rank: 3, name: "Curt",      pts: 45.7, grade: "A−" },
  { rank: 4, name: "JB",        pts: 42.0, grade: "B+" },
  { rank: 5, name: "Meme Team", pts: 41.5, grade: "B"  },
  { rank: 6, name: "AL",        pts: 41.3, grade: "B"  },
  { rank: 7, name: "D'Ags",     pts: 37.3, grade: "C+" },
  { rank: 8, name: "Chris",     pts: 36.3, grade: "C"  },
  { rank: 9, name: "Masumi",    pts: 35.5, grade: "C−" },
];

const RECAPS = {
  "Jer": `You landed the No. 1 overall asset in Mbappé and never looked back — Oyarzabal in the second is the value pick of the entire draft, and the De Bruyne–Belgium mini-stack hands you a clean Group G floor. Balanced, top-heavy where it counts, projected to win the whole thing. Dan Ndoye in the last round won't move the needle, but you'd earned the flier. Everyone else is playing for second.`,
  "Dan": `Kane gives you a Golden Boot-caliber anchor, and grabbing Brazil and Portugal back-to-back built the strongest two-team deep-run core in the pool. Saka in the fifth was a steal. The soft spot is the bench — Embolo and a Scotland-bound McTominay are filler — but with that top end, you're the one real threat to Jer.`,
  "D'Ags": `You cornered the team market early — Spain and England is the best two-team foundation anyone has. The problem's the other ledger: after Bellingham, your players (Raúl Jiménez, Ferran Torres, Doué) are rotation-tier. Great floor, low ceiling — you'll need Spain or England to actually lift the trophy to climb.`,
  "AL": `Colombia is the gem of your board — a genuine dark horse — and the Wirtz/Havertz German lean is a steady points stream. But you never landed a true elite anchor (Olise is your top gun), and Norway in the fourth was a reach with better teams still up. Well-spread, just a touch anchor-less.`,
  "Meme Team": `Haaland's the headline and also the gamble — Norway's brutal group could limit him to three games to fill the net, which is exactly why he's not scoring like a true anchor here. Argentina was a smart, high-floor grab, and Salah and Musiala round it nicely. You're live if Norway overdelivers, sunk if they bow out early.`,
  "Curt": `You went all-in on goals and it shows: Vinícius, Ronaldo, Gakpo, and Depay is the deepest forward line anyone built, with the Dutch double-stack as the kicker, and Vini at 13 was highway robbery. The catch is your teams — Mexico, Ecuador, Egypt are floor-merchants, not deep-run threats — so this is the highest-variance roster in the field: if your front four catch fire you win going away, but a couple cold draws and the mid-tier flags won't bail you out.`,
  "Masumi": `Brutal, because the attack is actually good — Yamal, Raphinha, and a falling Álvarez is a trio most would take. What sinks you to last is the team slate: Japan, Uruguay, and Scotland are the weakest set of countries anyone drafted, and in a pool where teams bank a third of the points, that's the margin. The forwards keep you breathing; the flags do not.`,
  "Chris": `France as your anchor team and Lautaro up top is a fine top two. But the Sweden triple-stack — Gyökeres and Isak and Sweden the team — is the head-scratcher of the draft: two strikers splitting minutes on a weak side, stuck in Curt's Dutch group. That concentration is what drags you down here.`,
  "JB": `Messi falling to you in the second was a gift, and pairing him with Bruno and Dembélé gives you real creative firepower. USA and Switzerland are sensible, safe team picks. What keeps you out of the top three: Paraguay in the last round is essentially a zero, and your countries top out at "advance, maybe win one." Solid, not scary.`,
};

// ---- email building ----
function ordinal(n) { const s = ["th","st","nd","rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

function standingsTable(highlight) {
  const rows = STANDINGS.map(s => {
    const me = s.name === highlight;
    return `<tr style="${me ? "font-weight:700;background:#f1ffce;" : ""}">
      <td style="padding:5px 12px;">${s.rank}</td>
      <td style="padding:5px 12px;">${s.name}</td>
      <td style="padding:5px 12px;text-align:right;">${s.pts.toFixed(1)}</td>
      <td style="padding:5px 12px;text-align:right;">${s.grade}</td>
    </tr>`;
  }).join("");
  return `<table style="border-collapse:collapse;font-family:ui-monospace,monospace;font-size:13px;width:100%;max-width:440px;">
    <thead><tr style="border-bottom:1px solid #ccc;text-align:left;color:#555;">
      <th style="padding:5px 12px;">#</th><th style="padding:5px 12px;">Manager</th>
      <th style="padding:5px 12px;text-align:right;">Pts</th><th style="padding:5px 12px;text-align:right;">Grade</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}

function emailHtml(name) {
  const me = STANDINGS.find(s => s.name === name);
  return `<div style="font-family:system-ui,Arial,sans-serif;max-width:600px;margin:auto;color:#111;line-height:1.55;">
    <h1 style="font-size:22px;letter-spacing:.5px;margin:0 0 4px;">THE GAFFERS — DRAFT RECAP</h1>
    <p style="color:#6a8a00;font-weight:700;margin:0 0 18px;">${name} · Grade ${me.grade} · Projected ${ordinal(me.rank)} (${me.pts.toFixed(1)} pts)</p>
    <p style="margin:0 0 24px;">${RECAPS[name]}</p>
    <h3 style="margin:0 0 8px;font-size:14px;">Projected Final Standings</h3>
    ${standingsTable(name)}
    <p style="color:#999;font-size:12px;margin-top:22px;">Projected only — now go prove it wrong. ⚽ thegaffers.com</p>
  </div>`;
}

// ---- send ----
for (const [name, email] of Object.entries(RECIPIENTS)) {
  if (!RECAPS[name]) { console.warn(`No recap for ${name} — skipping`); continue; }
  if (!email)        { console.log(`(skip ${name} — no email set)`); continue; }
  const me = STANDINGS.find(s => s.name === name);
  const subject = `Your Gaffers draft grade: ${me.grade} (projected ${ordinal(me.rank)})`;
  if (DRY_RUN) {
    console.log(`\n===== ${name} <${email}> =====\n${subject}\n${RECAPS[name]}\n`);
    continue;
  }
  await sendEmail({ name, email }, subject, emailHtml(name));
  console.log(`Sent to ${name} <${email}>`);
}

async function sendEmail(to, subject, htmlContent) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "content-type": "application/json", "api-key": BREVO_API_KEY },
    body: JSON.stringify({ sender: SENDER, to: [to], subject, htmlContent }),
  });
  if (!res.ok) console.error(`Brevo failed for ${to.email}: ${res.status} ${await res.text()}`);
}
