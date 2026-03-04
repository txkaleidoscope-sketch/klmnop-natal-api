// api/natal.js
// Vercel Serverless Function (Node.js) - generate-and-discard, minimal logging.

const sgMail = require("@sendgrid/mail");
const { DateTime } = require("luxon");

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function isValidDateYYYYMMDD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function isValidTimeHHMM(s) {
  return typeof s === "string" && /^\d{2}:\d{2}$/.test(s);
}
function safeTrim(v) {
  return typeof v === "string" ? v.trim() : "";
}

function buildBasicAuth(userId, apiKey) {
  const token = Buffer.from(`${userId}:${apiKey}`).toString("base64");
  return `Basic ${token}`;
}

async function astrologyPost(endpoint, data) {
  const userId = process.env.ASTROLOGYAPI_USER_ID;
  const apiKey = process.env.ASTROLOGYAPI_KEY;
  if (!userId || !apiKey) throw new Error("Missing AstrologyAPI env vars.");

  const resp = await fetch(`https://json.astrologyapi.com/v1/${endpoint}`, {
    method: "POST",
    headers: {
      authorization: buildBasicAuth(userId, apiKey),
      "content-type": "application/json",
      "accept-language": "en",
    },
    body: JSON.stringify(data),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`AstrologyAPI ${endpoint} failed: ${resp.status} ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`AstrologyAPI ${endpoint} returned non-JSON.`);
  }
}

function normalizeCountry(c) {
  const cc = safeTrim(c);
  if (!cc) return "";
  const map = {
    USA: "United States",
    "U.S.A.": "United States",
    US: "United States",
    "U.S.": "United States",
    UK: "United Kingdom",
    UAE: "United Arab Emirates",
  };
  return map[cc] || cc;
}

function signBlurbSun(sign) {
  const m = {
    Aries: "bold initiator energy—direct, decisive, built to begin.",
    Taurus: "steady builder energy—sensual, loyal, built to sustain.",
    Gemini: "curious connector energy—quick, social, built to learn.",
    Cancer: "nurturing protector energy—intuitive, devoted, built to care.",
    Leo: "radiant creator energy—confident, generous, built to shine.",
    Virgo: "precision improver energy—practical, discerning, built to refine.",
    Libra: "harmonizer energy—relational, aesthetic, built to balance.",
    Scorpio: "transformer energy—deep, magnetic, built to evolve.",
    Sagittarius: "explorer energy—honest, expansive, built to seek meaning.",
    Capricorn: "architect energy—disciplined, ambitious, built to achieve.",
    Aquarius: "visionary energy—independent, inventive, built to innovate.",
    Pisces: "mystic empath energy—imaginative, compassionate, built to heal.",
  };
  return m[sign] || "core vitality energy—unique, complex, unmistakably you.";
}

function signBlurbMoon(sign) {
  const m = {
    Aries: "emotions move fast—needs action, honesty, and release.",
    Taurus: "emotions want calm—needs comfort, consistency, and touch.",
    Gemini: "emotions need words—processes through talk, humor, and variety.",
    Cancer: "emotions run deep—needs safety, family, and soft intimacy.",
    Leo: "emotions want warmth—needs loyalty, play, and appreciation.",
    Virgo: "emotions seek order—needs clarity, usefulness, and clean routines.",
    Libra: "emotions want harmony—needs peace, partnership, and beauty.",
    Scorpio: "emotions are intense—needs trust, privacy, and total honesty.",
    Sagittarius: "emotions want freedom—needs space, laughter, and truth.",
    Capricorn: "emotions want stability—needs respect, structure, and results.",
    Aquarius: "emotions need autonomy—needs friendship, ideas, and breathing room.",
    Pisces: "emotions are porous—needs rest, art, and gentle boundaries.",
  };
  return m[sign] || "emotions have their own rhythm—listen for what keeps you steady.";
}

function signBlurbRising(sign) {
  const m = {
    Aries: "you come across bold, fast, and self-starting.",
    Taurus: "you come across grounded, calm, and sensual.",
    Gemini: "you come across witty, curious, and mentally quick.",
    Cancer: "you come across caring, protective, and intuitive.",
    Leo: "you come across bright, confident, and magnetic.",
    Virgo: "you come across observant, helpful, and detail-aware.",
    Libra: "you come across charming, graceful, and relational.",
    Scorpio: "you come across intense, private, and powerful.",
    Sagittarius: "you come across upbeat, candid, and adventurous.",
    Capricorn: "you come across composed, capable, and ambitious.",
    Aquarius: "you come across unique, future-minded, and a bit untouchable (in a good way).",
    Pisces: "you come across dreamy, compassionate, and artistic.",
  };
  return m[sign] || "you come across in a distinctive way—people notice your signature.";
}

function buildInterpretationHTML({ name, sun, moon, rising }) {
  const displayName = safeTrim(name) ? safeTrim(name) : "friend";
  return `
    <div>
      <h2 style="margin:0 0 10px 0;">Your Big 3 Snapshot</h2>

      <p><strong>Discover</strong>: ${displayName}, your core is <strong>${sun} Sun</strong> — ${signBlurbSun(sun)}
      Your inner world is <strong>${moon} Moon</strong> — ${signBlurbMoon(moon)}
      And your first impression is <strong>${rising} Rising</strong> — ${signBlurbRising(rising)}</p>

      <p><strong>Navigate</strong>: When life gets loud, let your <strong>${moon} Moon</strong> choose the emotional “home base.”
      Then let your <strong>${sun} Sun</strong> decide the direction. Your <strong>${rising} Rising</strong> is the social steering wheel—use it consciously.</p>

      <p><strong>Accelerate</strong>: Your growth hack is alignment:
      <em>feel</em> it (${moon}), <em>choose</em> it (${sun}), then <em>show</em> it (${rising}).</p>

      <p><strong>Celebrate</strong>: Your “Big 3” blend—<strong>${sun} / ${moon} / ${rising}</strong>—is a real signature.</p>
    </div>
  `.trim();
}

function buildFullHTML({ name, email, birthDate, birthTime, locationLine, big3, interpretationHTML }) {
  const titleName = safeTrim(name) ? safeTrim(name) : "Natal Snapshot";
  return `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${titleName}</title>
      <style>
        body { font-family: Arial, sans-serif; color:#111; padding: 28px; }
        .card { border: 1px solid #eee; border-radius: 14px; padding: 18px; margin-bottom: 16px; }
        h1 { font-size: 22px; margin: 0 0 8px 0; }
        .meta { font-size: 12px; color:#444; line-height: 1.45; }
        .pill { display:inline-block; padding:6px 10px; border-radius:999px; background:#f6f6f6; margin-right:8px; font-size:12px; }
        hr { border:none; border-top:1px solid #eee; margin: 16px 0; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>${titleName}</h1>
        <div class="meta">
          <div><strong>Email:</strong> ${email}</div>
          <div><strong>Birth:</strong> ${birthDate} @ ${birthTime}</div>
          <div><strong>Location:</strong> ${locationLine}</div>
        </div>
        <hr />
        <div>
          <span class="pill"><strong>Sun</strong>: ${big3.sun}</span>
          <span class="pill"><strong>Moon</strong>: ${big3.moon}</span>
          <span class="pill"><strong>Rising</strong>: ${big3.rising}</span>
        </div>
      </div>

      <div class="card">
        ${interpretationHTML}
      </div>

      <div class="meta" style="margin-top:14px;">
        Privacy: This report is generated on-demand and not stored.
      </div>
    </body>
  </html>
  `.trim();
}

async function htmlToPdfBuffer(html) {
  const key = process.env.PDFSHIFT_API_KEY;

  // SAFE DEBUG: prints only first 4 chars + length (does NOT reveal the key)
  const keyPreview = key ? `${key.slice(0, 4)}… (len=${key.length})` : "MISSING";
  console.error("PDFSHIFT_API_KEY:", keyPreview);

  if (!key) throw new Error("Missing PDFSHIFT_API_KEY.");

  const resp = await fetch("https://api.pdfshift.io/v3/convert/pdf", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${key}:`).toString("base64"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: html,
      format: "Letter",
      margin: "0.6in",
      print_background: true,
    }),
  });

  const buf = Buffer.from(await resp.arrayBuffer());
  if (!resp.ok) {
    const msg = buf.toString("utf8").slice(0, 500);
    throw new Error(`PDFShift failed: ${resp.status} ${msg}`);
  }
  return buf;
}

async function sendEmailWithPdf({ to, from, subject, text, filename, pdfBuffer }) {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) throw new Error("Missing SENDGRID_API_KEY.");

  sgMail.setApiKey(key);

  const msg = {
    to,
    from,
    subject,
    text,
    attachments: [
      {
        content: pdfBuffer.toString("base64"),
        filename,
        type: "application/pdf",
        disposition: "attachment",
      },
    ],
  };

  await sgMail.send(msg);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Method Not Allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

    const name = safeTrim(body.name);
    const birthDate = safeTrim(body.birthDate);
    const birthTime = safeTrim(body.birthTime);
    const birthCity = safeTrim(body.birthCity);
    const birthRegion = safeTrim(body.birthRegion);
    const birthCountry = safeTrim(body.birthCountry);
    const email = safeTrim(body.email);
    const website = safeTrim(body.website);

    if (website) return json(res, 400, { error: "Spam detected." });

    if (!isValidDateYYYYMMDD(birthDate)) return json(res, 400, { error: "birthDate must be YYYY-MM-DD" });
    if (!isValidTimeHHMM(birthTime)) return json(res, 400, { error: "birthTime must be HH:MM" });
    if (!birthCity) return json(res, 400, { error: "birthCity is required" });
    if (!birthCountry) return json(res, 400, { error: "birthCountry is required" });
    if (!email || !email.includes("@")) return json(res, 400, { error: "Valid email is required" });

    const fromEmail = process.env.SENDGRID_FROM_EMAIL;
    if (!fromEmail) throw new Error("Missing SENDGRID_FROM_EMAIL.");

    const [yearStr, monthStr, dayStr] = birthDate.split("-");
    const [hourStr, minStr] = birthTime.split(":");

    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    const hour = Number(hourStr);
    const min = Number(minStr);

    // Geo lookup retries
    const countryNorm = normalizeCountry(birthCountry);
    const placeCandidates = [
      [birthCity, birthRegion, countryNorm].filter(Boolean).join(", "),
      [birthCity, countryNorm].filter(Boolean).join(", "),
      [birthCity, birthRegion, countryNorm].filter(Boolean).join(" "),
      [birthCity, countryNorm].filter(Boolean).join(" "),
      birthCity,
    ];

    let best = null;
    let usedPlace = placeCandidates[0];

    for (const candidate of placeCandidates) {
      const geo = await astrologyPost("geo_details", { place: candidate, maxRows: 5 });
      best = geo?.geonames?.[0] || null;
      if (best) {
        usedPlace = candidate;
        break;
      }
    }
    if (!best) throw new Error("Geo lookup returned no results.");

    const lat = Number(best.latitude);
    const lon = Number(best.longitude);

    // Timezone name from geo response; compute offset with Luxon
    const tzName =
      safeTrim(best.timezone) ||
      safeTrim(best.timezoneId) ||
      safeTrim(best.timezone_id) ||
      safeTrim(best.timezone_name) ||
      "";

    if (!tzName) throw new Error("Geo lookup did not return a timezone name.");

    const dt = DateTime.fromISO(`${birthDate}T${birthTime}`, { zone: tzName });
    if (!dt.isValid) throw new Error(`Invalid datetime: ${dt.invalidExplanation || "unknown"}`);

    const tzone = dt.offset / 60;

    // Big 3
    const planets = await astrologyPost("planets/tropical", {
      day,
      month,
      year,
      hour,
      min,
      lat,
      lon,
      tzone,
      house_type: "placidus",
    });

    const list = Array.isArray(planets) ? planets : (planets?.planets || []);
    const findSign = (planetName) => {
      const p = list.find((x) => (x?.name || "").toLowerCase() === planetName.toLowerCase());
      return safeTrim(p?.sign);
    };

    const sun = findSign("Sun");
    const moon = findSign("Moon");
    const rising = findSign("Ascendant");

    if (!sun || !moon || !rising) {
      throw new Error(`Could not extract Big 3 (sun=${sun}, moon=${moon}, rising=${rising}).`);
    }

    const big3 = { sun, moon, rising };
    const interpretationHTML = buildInterpretationHTML({ name, sun, moon, rising });

    const fullHTML = buildFullHTML({
      name,
      email,
      birthDate,
      birthTime,
      locationLine: usedPlace,
      big3,
      interpretationHTML,
    });

    const pdfBuffer = await htmlToPdfBuffer(fullHTML);

    let email_status = "sent";
    try {
      const subject = "Your Natal Snapshot (Big 3 PDF)";
      const text = "Attached is your Natal Snapshot PDF.\n\nPrivacy note: This report is generated on-demand and not stored.";
      const filename = `natal-snapshot-${birthDate}.pdf`;

      await sendEmailWithPdf({
        to: email,
        from: fromEmail,
        subject,
        text,
        filename,
        pdfBuffer,
      });
    } catch (e) {
      console.error("SendGrid error:", e?.message || e);
      email_status = "failed";
    }

    return json(res, 200, {
      email_status,
      big3,
      interpretation_html: interpretationHTML,
    });
  } catch (err) {
    console.error("Fatal error:", err?.message || err);
    return json(res, 500, { error: "Server error. Please try again." });
  }
};