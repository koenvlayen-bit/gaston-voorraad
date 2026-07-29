// api/marktprijs.js — Vercel Serverless Function
//
// Haalt Google Shopping-prijzen op via SerpApi — SYNCHROON: één aanvraag,
// meteen een antwoord (geen taak starten + later ophalen zoals bij DataForSEO).
//
// Vereist de environment variable SERPAPI_KEY, ingesteld in Vercel
// (Project Settings > Environment Variables). Nooit in de broncode zetten —
// dit bestand draait enkel op de server, dus process.env is hier veilig.

module.exports = async function handler(req, res) {
  const query = (req.query.query || "").trim();
  const expectedPrice = parseFloat(req.query.expected_price);
  const hasExpectedPrice = !isNaN(expectedPrice) && expectedPrice > 0;

  if (!query) {
    return res.status(400).json({ error: "Parameter 'query' (artikelnaam) ontbreekt." });
  }

  // Welk gekend merk staat vooraan in de artikelnaam? (bv. "Egmont bowling set" -> "egmont")
  // Dat merk moet straks terugkomen in de titel van een match — dat vangt precies
  // het soort fout op dat de prijsfilter alleen mist: een generieke bowlingset van
  // een ander merk die toevallig in een plausibele prijsmarge valt.
  const KNOWN_BRANDS = ["egmont", "moulin roty", "goki", "knetä", "kneta", "snackbackman"];
  const queryLower = query.toLowerCase();
  const detectedBrand = KNOWN_BRANDS.find((b) => queryLower.startsWith(b));

  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "SERPAPI_KEY ontbreekt op de server (environment variable is niet ingesteld in Vercel).",
    });
  }

  const params = new URLSearchParams({
    engine: "google_shopping",
    q: query,
    gl: "nl", // land: Nederland
    hl: "nl", // taal: Nederlands
    google_domain: "google.nl",
    api_key: apiKey,
  });

  try {
    const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
    const data = await response.json();

    if (data.error) {
      return res.status(200).json({ error: "SerpApi-fout: " + data.error });
    }

    const results = data.shopping_results || [];

    const rawEntries = results
      .map((r) => {
        const price = typeof r.extracted_price === "number" ? r.extracted_price : null;
        if (!price || price <= 0) return null;
        return {
          price,
          url: r.product_link || r.link || null,
          domain: r.source || null,
          title: (r.title || "").toLowerCase(),
        };
      })
      .filter((e) => e !== null);

    // Filter 1 — merk-check: als de artikelnaam met een gekend merk begint, moet
    // dat merk terugkomen in de titel van het resultaat. Vangt "ander merk,
    // toevallig gelijkaardige prijs" op (bv. een generieke bowlingset i.p.v. Egmont).
    const brandFiltered = detectedBrand
      ? rawEntries.filter((e) => e.title.includes(detectedBrand))
      : rawEntries;

    // Filter 2 — prijs-plausibiliteit: als we de eigen winkelprijs kennen, negeer
    // resultaten die extreem afwijken (buiten 40%-250% van die prijs) — meestal
    // een teken dat het om een ander product gaat, niet om een echt prijsverschil.
    const priceFiltered = hasExpectedPrice
      ? brandFiltered.filter((e) => e.price >= expectedPrice * 0.4 && e.price <= expectedPrice * 2.5)
      : brandFiltered;

    const priceEntries = priceFiltered.slice(0, 10);
    const aantalGefilterd = rawEntries.length - priceEntries.length;

    const prices = priceEntries.map((e) => e.price);
    const gemiddelde =
      prices.length > 0 ? (prices.reduce((s, p) => s + p, 0) / prices.length).toFixed(2) : null;

    return res.status(200).json({
      gevondenPrijzen: priceEntries,
      aantalGevonden: priceEntries.length,
      aantalGefilterd: aantalGefilterd > 0 ? aantalGefilterd : 0,
      gemiddelde,
    });
  } catch (err) {
    return res.status(500).json({ error: "Serverfout bij ophalen: " + err.message });
  }
};
