/**
 * JSON-LD SEO pour ATS Check.
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
    const url = (site.url || "https://www.ats-check.fr/").replace(/\/?$/, "/");
    const name = site.name || "ATS Check";
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
                text: "Non. L’analyse est effectuée localement dans votre navigateur.",
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
