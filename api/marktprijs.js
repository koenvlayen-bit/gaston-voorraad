// api/marktprijs.js — Vercel Serverless Function
//
// EXPERIMENTEEL — "gratis testroute" om te zien of een geautomatiseerde
// zoekopdracht naar Google Shopping praktisch haalbaar is voor gastonshop.be,
// zonder betaalde SERP-API.
//
// Belangrijk om te weten:
// - Dit gebruikt GEEN officiële Google API. Het haalt de publieke Google Shopping
//   zoekresultatenpagina op en zoekt daarin naar prijzen met een simpele patroon-match.
// - Dit is tegen Google's gebruiksvoorwaarden en kan op elk moment stoppen met werken
//   (CAPTCHA, blokkade, of een gewijzigde paginastructuur). Er is geen garantie.
// - Zonder EAN-code matcht dit puur op productnaam — verschillende varianten/maten
//   van "hetzelfde" artikel kunnen door elkaar staan. Behandel elk resultaat als
//   een ruwe indicatie, niet als een feit.
//
// Deze functie draait op Vercel's servers (Node), niet in de browser — dat is
// nodig omdat Google een browser-aanvraag met CORS zou blokkeren.

module.exports = async function handler(req, res) {
  const query = (req.query.query || "").trim();
  const land = req.query.land === "nl" ? "nl" : "be"; // default: België

  if (!query) {
    return res.status(400).json({ error: "Parameter 'query' (artikelnaam) ontbreekt." });
  }

  const domain = land === "nl" ? "google.nl" : "google.be";
  const url = `https://www.${domain}/search?tbm=shop&hl=nl&gl=${land}&q=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "nl-BE,nl;q=0.9,en;q=0.8",
      },
    });

    const html = await response.text();

    // --- Detectie van blokkade / CAPTCHA ---
    const blockedSignals = [
      "recaptcha",
      "Our systems have detected unusual traffic",
      "detected unusual traffic from your computer network",
      "/sorry/index",
    ];
    const isBlocked =
      response.status === 429 ||
      response.status === 403 ||
      blockedSignals.some((signal) => html.includes(signal));

    if (isBlocked) {
      return res.status(200).json({
        blocked: true,
        message:
          "Google blokkeert deze aanvraag (CAPTCHA of ongewoon-verkeer-detectie). Dit is precies het risico waarvoor we deze testroute aan het uitproberen zijn — probeer het later opnieuw of noteer wanneer dit begint te gebeuren.",
      });
    }

    // --- Ruwe prijs-extractie ---
    const priceRegex = /€\s?(\d{1,4}(?:[.,]\d{2})?)/g;
    const rawMatches = [...html.matchAll(priceRegex)].map((m) =>
      parseFloat(m[1].replace(",", "."))
    );

    const prices = [...new Set(rawMatches)]
      .filter((p) => p > 1 && p < 2000)
      .sort((a, b) => a - b)
      .slice(0, 15);

    const gemiddelde =
      prices.length > 0
        ? (prices.reduce((sum, p) => sum + p, 0) / prices.length).toFixed(2)
        : null;

    // TIJDELIJK — debug-informatie om te achterhalen waarom er geen prijzen
    // gevonden worden. Kan later weer verwijderd worden.
    const debugInfo = prices.length === 0 ? {
      response_status: response.status,
      response_url: response.url,   // toont of er een redirect gebeurde (bv. naar een cookie-pagina)
      html_length: html.length,
      html_snippet: html.slice(0, 400),
    } : undefined;

    return res.status(200).json({
      blocked: false,
      query,
      land,
      gevondenPrijzen: prices,
      aantalGevonden: prices.length,
      gemiddelde,
      let_op:
        "Experimentele schatting zonder EAN-matching — enkel als ruwe indicatie te gebruiken.",
      debug: debugInfo,
    });
  } catch (err) {
    return res.status(500).json({ error: "Serverfout bij ophalen: " + err.message });
  }
}
