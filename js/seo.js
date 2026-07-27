/**
 * JSON-LD SEO pour Test Mon CV.
 */
window.ATSSeo = (function () {
  function inject(data) {
    const existing = document.getElementById("ats-jsonld");
    if (existing) existing.remove();
    const s = document.createElement("script");
    s.type = "application/ld+json";
    s.id = "ats-jsonld";
    s.textContent = JSON.stringify(data);
    document.head.appendChild(s);
  }

  function build(site) {
    const url = (site.url || "https://www.testmoncv.fr/").replace(/\/?$/, "/");
    const name = site.name || "Test Mon CV";
    return {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          "@id": `${url}#website`,
          url,
          name,
          description: site.description,
          inLanguage: "fr-FR",
          publisher: { "@id": `${url}#org` },
        },
        {
          "@type": "Organization",
          "@id": `${url}#org`,
          name,
          url,
          email: site.email,
          logo: `${url}icons/icon-512.png`,
        },
        {
          "@type": "WebApplication",
          "@id": `${url}#app`,
          name: `${name} — Vérificateur ATS`,
          url,
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "EUR",
          },
          description: site.description,
          inLanguage: "fr-FR",
        },
        {
          "@type": "FAQPage",
          "@id": `${url}#faq`,
          mainEntity: [
            {
              "@type": "Question",
              name: "Comment est calculé le score ATS ?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Le score /100 agrège 4 axes : lisibilité ATS, structure, qualité du contenu et mots-clés.",
              },
            },
            {
              "@type": "Question",
              name: "L’analyse envoie-t-elle mon CV sur un serveur ?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Par défaut non : l’analyse est locale. L’Enrichissement Extrait (optionnel) envoie un extrait pour grammaire / géocode / photo. Le Mode Pro peut aussi envoyer le texte pour LLM/ESCO/PDF, sans conservation longue.",
              },
            },
            {
              "@type": "Question",
              name: "Quels formats de CV sont acceptés ?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "PDF et DOCX jusqu’à 10 Mo.",
              },
            },
          ],
        },
      ],
    };
  }

  function init(site) {
    if (!site) return;
    inject(build(site));
  }

  return { init, build };
})();
