// sitemap-generator/generate-sitemaps.js
require("dotenv").config();
const axios = require("axios");
const { create } = require("xmlbuilder2");
const fs = require("fs");
const path = require("path");

// --- Configuration ---
const STRAPI_API_URL = process.env.STRAPI_API_URL;
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN;
const SITE_BASE_URL = process.env.SITE_BASE_URL;
const LANGUAGES = (process.env.LANGUAGES || "en")
  .split(",")
  .map((lang) => lang.trim());
const DEFAULT_LANGUAGE = LANGUAGES[0];

const CONTENT_TYPES_CONFIG = [
  // Collections
  {
    type: "collection",
    apiSlug: "reports",
    pathPrefix: "reports",
    priority: "0.9",
    changefreq: "weekly",
  },
  {
    type: "collection",
    apiSlug: "news-articles",
    pathPrefix: "news",
    priority: "0.9",
    changefreq: "daily",
  },
  {
    type: "collection",
    apiSlug: "blogs",
    pathPrefix: "blog",
    priority: "0.9",
    changefreq: "monthly",
  },

  // Actual Single Types from Strapi (EXCLUDING a placeholder for the homepage if it's not fetched from Strapi as a specific 'home-page-api' type)
  {
    type: "single",
    apiSlug: "about-page",
    defaultUrlPath: "about",
    priority: "0.7",
    changefreq: "yearly",
    sitemapFileKeyBase: "single-pages",
  },
  {
    type: "single",
    apiSlug: "cancellation-policy",
    defaultUrlPath: "cancellation-policy",
    priority: "0.5",
    changefreq: "yearly",
    sitemapFileKeyBase: "single-pages",
  },
  {
    type: "single",
    apiSlug: "contact-page",
    defaultUrlPath: "contact",
    priority: "0.7",
    changefreq: "yearly",
    sitemapFileKeyBase: "single-pages",
  },
  {
    type: "single",
    apiSlug: "disclaimer",
    defaultUrlPath: "disclaimer",
    priority: "0.5",
    changefreq: "yearly",
    sitemapFileKeyBase: "single-pages",
  },
  {
    type: "single",
    apiSlug: "legal",
    defaultUrlPath: "legal",
    priority: "0.5",
    changefreq: "yearly",
    sitemapFileKeyBase: "single-pages",
  },
  {
    type: "single",
    apiSlug: "privacy-policy",
    defaultUrlPath: "privacy-policy",
    priority: "0.5",
    changefreq: "yearly",
    sitemapFileKeyBase: "single-pages",
  },
  {
    type: "single",
    apiSlug: "services-page",
    defaultUrlPath: "services",
    priority: "0.8",
    changefreq: "monthly",
    sitemapFileKeyBase: "single-pages",
  },
  {
    type: "single",
    apiSlug: "t-and-c",
    defaultUrlPath: "terms-and-conditions",
    priority: "0.5",
    changefreq: "yearly",
    sitemapFileKeyBase: "single-pages",
  },
];

const OUTPUT_DIR = process.env.SITEMAP_OUTPUT_DIR;
const SITEMAP_URL_LIMIT = 45000;
const STRAPI_PAGE_SIZE = 100;
const STATE_FILE_PATH = path.join(OUTPUT_DIR, "sitemap_state.json");
const SCRIPT_MODE = process.env.SITEMAP_GENERATION_MODE || "full";

if (!STRAPI_API_URL || !STRAPI_API_TOKEN || !SITE_BASE_URL || !OUTPUT_DIR) {
  console.error("Error: Missing required environment variables.");
  process.exit(1);
}

const axiosInstance = axios.create({
  baseURL: STRAPI_API_URL,
  headers: { Authorization: `Bearer ${STRAPI_API_TOKEN}` },
});

function getPageUrl(
  language,
  pathSegment,
  itemType = "collection",
  slugIfCollection = null
) {
  const langPrefix =
    language === DEFAULT_LANGUAGE || language === "" ? "" : `/${language}`;
  if (itemType === "single") {
    return pathSegment === "" ||
      pathSegment === null ||
      typeof pathSegment === "undefined"
      ? langPrefix === ""
        ? `${SITE_BASE_URL}/`
        : `${SITE_BASE_URL}${langPrefix}`
      : `${SITE_BASE_URL}${langPrefix}/${pathSegment}`;
  }
  return `${SITE_BASE_URL}${langPrefix}/${pathSegment}/${slugIfCollection}`;
}

function generateSitemapXML(urls) {
  const doc = create({ version: "1.0", encoding: "UTF-8" });
  doc.instruction("xml-stylesheet", 'type="text/xsl" href="/sitemap.xsl"');
  const urlset = doc.ele("urlset", {
    xmlns: "http://www.sitemaps.org/schemas/sitemap/0.9",
    "xmlns:xhtml": "http://www.w3.org/1999/xhtml",
  });
  urls.forEach((urlData) => {
    const urlElement = urlset.ele("url");
    urlElement.ele("loc").txt(urlData.loc);
    if (urlData.lastmod) urlElement.ele("lastmod").txt(urlData.lastmod);
    if (urlData.changefreq)
      urlElement.ele("changefreq").txt(urlData.changefreq);
    if (urlData.priority) urlElement.ele("priority").txt(urlData.priority);
    if (urlData.alternates && urlData.alternates.length > 0) {
      urlData.alternates.forEach((alt) =>
        urlElement.ele("xhtml:link", {
          rel: "alternate",
          hreflang: alt.hreflang,
          href: alt.href,
        })
      );
    }
  });
  return doc.end({ prettyPrint: true });
}

function generateSitemapIndexXML(sitemapLocations) {
  const doc = create({ version: "1.0", encoding: "UTF-8" });
  doc.instruction("xml-stylesheet", 'type="text/xsl" href="/sitemap.xsl"');
  const sitemapindex = doc.ele("sitemapindex", {
    xmlns: "http://www.sitemaps.org/schemas/sitemap/0.9",
  });
  sitemapLocations.forEach((locData) => {
    const sitemapElement = sitemapindex.ele("sitemap");
    sitemapElement.ele("loc").txt(locData.loc);
    if (locData.lastmod) sitemapElement.ele("lastmod").txt(locData.lastmod);
  });
  return doc.end({ prettyPrint: true });
}

function readExistingSitemap(filepath) {
  if (!fs.existsSync(filepath)) return new Map();
  try {
    const xmlString = fs.readFileSync(filepath, "utf-8");
    const doc = create(xmlString);
    const urls = new Map();
    doc.root().find(
      (el) => el.node.nodeName === "url",
      (el) => {
        const loc = el
          .find((c) => c.node.nodeName === "loc", null, true)
          ?.text();
        if (loc) {
          const lastmod = el
            .find((c) => c.node.nodeName === "lastmod", null, true)
            ?.text();
          const alternates = [];
          el.forEach((child) => {
            if (child.node.nodeName === "xhtml:link")
              alternates.push({
                hreflang: child.node.getAttribute("hreflang"),
                href: child.node.getAttribute("href"),
              });
          }, true);
          urls.set(loc, {
            loc,
            lastmod,
            alternates,
            changefreq: el
              .find((c) => c.node.nodeName === "changefreq", null, true)
              ?.text(),
            priority: el
              .find((c) => c.node.nodeName === "priority", null, true)
              ?.text(),
          });
        }
      },
      true
    );
    return urls;
  } catch (e) {
    console.warn(`Could not parse existing sitemap ${filepath}:`, e.message);
    return new Map();
  }
}

async function fetchStrapiCollectionEntries(
  contentTypeApiSlug,
  language,
  sinceTimestamp = null
) {
  console.log(
    `Fetching collection ${contentTypeApiSlug} for lang: ${language}${
      sinceTimestamp
        ? ` since ${new Date(sinceTimestamp).toISOString()}`
        : " (full)"
    }`
  );
  let allEntries = [];
  let page = 1;
  let totalPages = 1;
  const params = {
    locale: language,
    "fields[0]": "slug",
    "fields[1]": "updatedAt",
    "fields[2]": "locale",
    "populate[localizations][fields][0]": "slug",
    "populate[localizations][fields][1]": "locale",
    "pagination[page]": page,
    "pagination[pageSize]": STRAPI_PAGE_SIZE,
    "sort[0]": "updatedAt:desc",
    publicationState: "live",
  };
  if (sinceTimestamp)
    params["filters[updatedAt][$gt]"] = new Date(sinceTimestamp).toISOString();
  try {
    do {
      params["pagination[page]"] = page;
      const response = await axiosInstance.get(`/api/${contentTypeApiSlug}`, {
        params,
      });
      if (response.data && response.data.data) {
        allEntries = allEntries.concat(response.data.data);
        if (page === 1 && response.data.meta?.pagination)
          totalPages = response.data.meta.pagination.pageCount;
        console.log(
          `Fetched pg ${page}/${totalPages} for ${contentTypeApiSlug} (${language}) - ${response.data.data.length} items`
        );
      } else break;
      page++;
    } while (page <= totalPages);
  } catch (e) {
    console.error(
      `Error fetching ${contentTypeApiSlug} (${language}):`,
      e.response?.data || e.message
    );
  }
  console.log(
    `Finished ${contentTypeApiSlug} (${language}). Total: ${allEntries.length}`
  );
  return allEntries;
}

async function fetchStrapiSingleEntry(singleTypeApiSlug, language) {
  console.log(`Fetching single ${singleTypeApiSlug} for lang: ${language}`);
  try {
    const params = {
      locale: language,
      "populate[localizations][fields][0]": "locale",
      "fields[0]": "updatedAt",
      "fields[1]": "locale",
      "fields[2]": "publishedAt",
      publicationState: "live",
    };
    const response = await axiosInstance.get(`/api/${singleTypeApiSlug}`, {
      params,
    });
    if (response.data?.data?.attributes?.publishedAt) return response.data.data;
    console.log(
      `Single ${singleTypeApiSlug} (${language}) not found/published.`
    );
    return null;
  } catch (e) {
    if (e.response?.status === 404)
      console.log(`Single ${singleTypeApiSlug} (${language}) not found (404).`);
    else if (e.response?.data?.error)
      console.error(
        `Error fetching ${singleTypeApiSlug} (${language}): Status ${e.response.data.error.status} - ${e.response.data.error.message}`
      );
    else
      console.error(
        `Error fetching ${singleTypeApiSlug} (${language}):`,
        e.message
      );
    return null;
  }
}

function loadLastRunState() {
  if (fs.existsSync(STATE_FILE_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE_PATH, "utf-8"));
    } catch (e) {
      console.warn("Could not read state:", e.message);
    }
  }
  return { lastSuccessfulRunTimestamp: null };
}

function saveLastRunState(timestamp) {
  try {
    fs.writeFileSync(
      STATE_FILE_PATH,
      JSON.stringify({ lastSuccessfulRunTimestamp: timestamp })
    );
    console.log(`Saved state: ${new Date(timestamp).toISOString()}`);
  } catch (e) {
    console.error("Could not write state:", e.message);
  }
}

async function main() {
  console.log(`Starting sitemap gen in "${SCRIPT_MODE}" mode...`);
  const startTime = Date.now();
  let lastRunTimestamp = null;
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (SCRIPT_MODE === "full") {
    console.log("Full mode: Cleaning sitemaps & state.");
    fs.readdirSync(OUTPUT_DIR).forEach((f) => {
      if (f.endsWith(".xml") || f === "sitemap_state.json")
        try {
          fs.rmSync(path.join(OUTPUT_DIR, f));
        } catch (e) {
          console.warn(`Could not rm ${f}: ${e.message}`);
        }
    });
  } else {
    const state = loadLastRunState();
    lastRunTimestamp = state.lastSuccessfulRunTimestamp;
    if (lastRunTimestamp)
      console.log(
        `Incremental: Last run ${new Date(lastRunTimestamp).toISOString()}`
      );
    else console.warn("Incremental: No last run. Full-like fetch.");
  }
  const allContentUrls = new Map();
  if (SCRIPT_MODE === "incremental") {
    fs.readdirSync(OUTPUT_DIR).forEach((f) => {
      if (f.endsWith(".xml") && f !== "sitemap.xml")
        readExistingSitemap(path.join(OUTPUT_DIR, f)).forEach((v, k) =>
          allContentUrls.set(k, v)
        );
    });
    console.log(`Incremental: Loaded ${allContentUrls.size} existing URLs.`);
  }
  let fetchedSomethingNew = false;

  console.log("Adding homepage URLs manually...");
  LANGUAGES.forEach((lang) => {
    const homepageLoc = getPageUrl(lang, "", "single");
    const alternates = LANGUAGES.map((altLang) => ({
      hreflang: altLang,
      href: getPageUrl(altLang, "", "single"),
    }));
    allContentUrls.set(homepageLoc, {
      loc: homepageLoc,
      lastmod: new Date().toISOString(),
      changefreq: "daily",
      priority: "1.0",
      alternates,
      _sitemapFileKeyBaseForGrouping: "single-pages", // Group with other single pages
    });
    console.log(`Added/Updated homepage for ${lang}: ${homepageLoc}`);
  });

  for (const lang of LANGUAGES) {
    for (const contentType of CONTENT_TYPES_CONFIG) {
      const isSingleType = contentType.type === "single";
      let entriesFromStrapi = [];
      if (isSingleType) {
        const singleEntry = await fetchStrapiSingleEntry(
          contentType.apiSlug,
          lang
        );
        if (singleEntry) {
          entriesFromStrapi.push(singleEntry);
          fetchedSomethingNew = true;
        } else if (SCRIPT_MODE === "incremental") {
          const locToRemove = getPageUrl(
            lang,
            contentType.defaultUrlPath,
            "single"
          );
          if (allContentUrls.has(locToRemove)) {
            allContentUrls.delete(locToRemove);
            console.log(
              `Incremental: Removed single ${locToRemove} (not found/published).`
            );
          }
        }
      } else {
        const collectionEntries = await fetchStrapiCollectionEntries(
          contentType.apiSlug,
          lang,
          SCRIPT_MODE === "incremental" ? lastRunTimestamp : null
        );
        if (collectionEntries.length > 0) fetchedSomethingNew = true;
        entriesFromStrapi.push(...collectionEntries);
      }
      entriesFromStrapi.forEach((entry) => {
        let pathSegment,
          itemSlug = null;
        if (isSingleType)
          pathSegment =
            contentType.defaultUrlPath === "" && lang === DEFAULT_LANGUAGE
              ? ""
              : contentType.defaultUrlPath;
        else {
          pathSegment = contentType.pathPrefix;
          if (!entry.attributes.slug) {
            console.warn(
              `Collection ${entry.id} (${contentType.apiSlug}, ${lang}) no slug. Skip.`
            );
            return;
          }
          itemSlug = entry.attributes.slug;
        }
        const currentLoc = getPageUrl(
          lang,
          pathSegment,
          isSingleType ? "single" : "collection",
          itemSlug
        );
        const alternates = [{ hreflang: lang, href: currentLoc }];
        if (entry.attributes.localizations?.data) {
          entry.attributes.localizations.data.forEach((locEntry) => {
            const altLocale = locEntry.attributes.locale;
            let altPath,
              altItemSlug = null;
            if (isSingleType)
              altPath =
                contentType.defaultUrlPath === "" &&
                altLocale !== DEFAULT_LANGUAGE &&
                altLocale !== ""
                  ? ""
                  : contentType.defaultUrlPath;
            else {
              altPath = contentType.pathPrefix;
              if (!locEntry.attributes.slug) return;
              altItemSlug = locEntry.attributes.slug;
            }
            if (altLocale)
              alternates.push({
                hreflang: altLocale,
                href: getPageUrl(
                  altLocale,
                  altPath,
                  isSingleType ? "single" : "collection",
                  altItemSlug
                ),
              });
          });
        }
        allContentUrls.set(currentLoc, {
          loc: currentLoc,
          lastmod: new Date(
            entry.attributes.updatedAt || Date.now()
          ).toISOString(),
          changefreq: contentType.changefreq || "monthly",
          priority: contentType.priority || "0.5",
          alternates,
          _sitemapFileKeyBaseForGrouping: isSingleType
            ? contentType.sitemapFileKeyBase
            : contentType.apiSlug,
        });
      });
    }
  }
  if (SCRIPT_MODE === "incremental" && lastRunTimestamp) {
    console.log("Incremental: Deletion checks for collections...");
    const liveLocs = new Set();
    for (const lang of LANGUAGES) {
      for (const ct of CONTENT_TYPES_CONFIG.filter(
        (c) => c.type === "collection"
      )) {
        (await fetchStrapiCollectionEntries(ct.apiSlug, lang, null)).forEach(
          (e) => {
            if (e.attributes.slug)
              liveLocs.add(
                getPageUrl(lang, ct.pathPrefix, "collection", e.attributes.slug)
              );
          }
        );
      }
    }
    const toDelete = [];
    allContentUrls.forEach((urlData, k) => {
      if (
        CONTENT_TYPES_CONFIG.some(
          (c) => c.type === "collection" && k.includes(`/${c.pathPrefix}/`)
        ) &&
        !liveLocs.has(k)
      )
        toDelete.push(k);
    });
    if (toDelete.length > 0) {
      console.log(
        `Incremental: Found ${toDelete.length} collection URLs to remove.`
      );
      toDelete.forEach((k) => allContentUrls.delete(k));
    }
  }
  console.log(
    `>>>> Reached point just before Array.from(allContentUrls.values()). Size: ${allContentUrls.size}`
  );
  const finalUrls = Array.from(allContentUrls.values());
  const sitemapRegistry = [];
  const urlsByFileKey = new Map();
  finalUrls.forEach((urlData) => {
    let fileKey = "other-uncategorized-pages";
    const locPath = new URL(urlData.loc).pathname;
    const entryLang =
      LANGUAGES.find((l) => locPath.startsWith(`/${l}/`)) || DEFAULT_LANGUAGE;

    if (urlData._sitemapFileKeyBaseForGrouping) {
      // Use this if present (set for homepage and fetched single types)
      fileKey = `${urlData._sitemapFileKeyBaseForGrouping}-${entryLang}`;
    } else {
      // Fallback for collections (though it should also have _sitemapFileKeyBaseForGrouping if set above)
      for (const ct of CONTENT_TYPES_CONFIG) {
        if (
          ct.type === "collection" &&
          locPath.includes(`/${ct.pathPrefix}/`)
        ) {
          fileKey = `${ct.apiSlug}-${entryLang}`;
          break;
        }
      }
    }
    if (!urlsByFileKey.has(fileKey)) urlsByFileKey.set(fileKey, []);
    urlsByFileKey.get(fileKey).push(urlData);
  });
  console.log(`Finished grouping. ${urlsByFileKey.size} sitemap groups.`);
  fs.readdirSync(OUTPUT_DIR).forEach((f) => {
    if (f.endsWith(".xml") && f !== "sitemap.xml")
      try {
        fs.rmSync(path.join(OUTPUT_DIR, f));
      } catch (e) {
        console.warn(`Could not rm ${f}: ${e.message}`);
      }
  });
  console.log("Removed old sitemap parts. Writing new ones...");
  urlsByFileKey.forEach((urlList, fileKeyBase) => {
    if (urlList.length === 0) {
      console.log(`Skipping empty sitemap group: ${fileKeyBase}`);
      return;
    }
    for (let i = 0; i < urlList.length; i += SITEMAP_URL_LIMIT) {
      const chunk = urlList.slice(i, i + SITEMAP_URL_LIMIT);
      const partSuffix =
        urlList.length > SITEMAP_URL_LIMIT
          ? `-${Math.floor(i / SITEMAP_URL_LIMIT) + 1}`
          : "";
      const sitemapFilename = `${fileKeyBase}${partSuffix}.xml`;
      const xmlContent = generateSitemapXML(chunk);
      fs.writeFileSync(path.join(OUTPUT_DIR, sitemapFilename), xmlContent);
      console.log(
        `Generated sitemap: ${sitemapFilename} with ${chunk.length} URLs`
      );
      sitemapRegistry.push({
        loc: `${SITE_BASE_URL}/sitemaps/${sitemapFilename}`,
        lastmod: new Date().toISOString(),
      });
    }
  });
  console.log("Finished writing sitemaps. Generating index...");
  if (sitemapRegistry.length > 0) {
    fs.writeFileSync(
      path.join(OUTPUT_DIR, "sitemap.xml"),
      generateSitemapIndexXML(sitemapRegistry)
    );
    console.log(
      `Generated index: sitemap.xml with ${sitemapRegistry.length} files`
    );
  } else {
    console.log("No sitemaps generated. Removing index if exists.");
    if (fs.existsSync(path.join(OUTPUT_DIR, "sitemap.xml")))
      fs.rmSync(path.join(OUTPUT_DIR, "sitemap.xml"));
  }
  if (
    SCRIPT_MODE === "full" ||
    (SCRIPT_MODE === "incremental" && fetchedSomethingNew) ||
    (SCRIPT_MODE === "incremental" && !lastRunTimestamp)
  )
    saveLastRunState(startTime);
  console.log(
    `Sitemap gen (${SCRIPT_MODE}) finished in ${
      (Date.now() - startTime) / 1000
    }s!`
  );
}
main().catch((error) => {
  console.error(`Sitemap gen (${SCRIPT_MODE}) FAILED:`, error);
  console.error("Stack:", error.stack);
  process.exit(1);
});
