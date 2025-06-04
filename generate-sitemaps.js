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
    changefreq: "weekly",
  },
  {
    type: "collection",
    apiSlug: "blogs",
    pathPrefix: "blogs",
    priority: "0.9",
    changefreq: "monthly",
  },
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

// In generate-sitemaps.js

function generateSitemapXML(urls) {
  const doc = create({ version: "1.0", encoding: "UTF-8" });

  const urlset = doc.ele("urlset", {
    xmlns: "http://www.sitemaps.org/schemas/sitemap/0.9",
  });

  urls.forEach((urlData) => {
    const urlElement = urlset.ele("url");
    urlElement.ele("loc").txt(urlData.loc);
    if (urlData.lastmod) urlElement.ele("lastmod").txt(urlData.lastmod);
    if (urlData.changefreq)
      urlElement.ele("changefreq").txt(urlData.changefreq);
    if (urlData.priority) urlElement.ele("priority").txt(urlData.priority);
  });

  return doc.end({ prettyPrint: true }); // This will include the correct XML declaration
}

function generateSitemapIndexXML(sitemapLocations) {
  const doc = create({ version: "1.0", encoding: "UTF-8" });

  const sitemapindex = doc.ele("sitemapindex", {
    xmlns: "http://www.sitemaps.org/schemas/sitemap/0.9",
  });

  sitemapLocations.forEach((locData) => {
    const sitemapElement = sitemapindex.ele("sitemap");
    sitemapElement.ele("loc").txt(locData.loc);
    if (locData.lastmod) sitemapElement.ele("lastmod").txt(locData.lastmod);
  });

  return doc.end({ prettyPrint: true }); // This will include the correct XML declaration
}

function readExistingSitemap(filepath) {
  if (!fs.existsSync(filepath)) return new Map();
  try {
    const xmlString = fs.readFileSync(filepath, "utf-8");

    // Use xmlbuilder2's convert functionality to parse existing XML
    const { convert } = require("xmlbuilder2");
    const parsed = convert(xmlString, { format: "object" });

    const urls = new Map();

    // Handle the parsed object structure
    if (parsed.urlset && parsed.urlset.url) {
      const urlArray = Array.isArray(parsed.urlset.url)
        ? parsed.urlset.url
        : [parsed.urlset.url];

      urlArray.forEach((urlData) => {
        if (urlData.loc) {
          const loc =
            typeof urlData.loc === "string"
              ? urlData.loc
              : urlData.loc["#text"] || urlData.loc.toString();
          const lastmod = urlData.lastmod
            ? typeof urlData.lastmod === "string"
              ? urlData.lastmod
              : urlData.lastmod["#text"] || urlData.lastmod.toString()
            : undefined;
          const changefreq = urlData.changefreq
            ? typeof urlData.changefreq === "string"
              ? urlData.changefreq
              : urlData.changefreq["#text"] || urlData.changefreq.toString()
            : undefined;
          const priority = urlData.priority
            ? typeof urlData.priority === "string"
              ? urlData.priority
              : urlData.priority["#text"] || urlData.priority.toString()
            : undefined;

          urls.set(loc, {
            loc,
            lastmod,
            changefreq,
            priority,
          });
        }
      });
    }

    console.log(`Successfully read ${urls.size} URLs from ${filepath}`);
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
  // We no longer need to populate localizations if we're not building xhtml:link alternates
  const params = {
    locale: language,
    "fields[0]": "slug",
    "fields[1]": "updatedAt",
    "fields[2]": "locale",
    /* Removed 'populate[localizations]' */ "pagination[page]": page,
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
    // We no longer need to populate localizations if we're not building xhtml:link alternates
    const params = {
      locale: language,
      /* Removed 'populate[localizations]' */ "fields[0]": "updatedAt",
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
    // Incremental mode
    const state = loadLastRunState();
    lastRunTimestamp = state.lastSuccessfulRunTimestamp;
    if (lastRunTimestamp)
      console.log(
        `Incremental: Last run ${new Date(lastRunTimestamp).toISOString()}`
      );
    else
      console.warn(
        "Incremental: No last run. Full-like fetch for new/updated items, full fetch for deletion check."
      );
  }

  const allContentUrls = new Map(); // This will hold all URLs to be put in sitemaps

  // In incremental mode, load existing URLs and try to derive their grouping key
  if (SCRIPT_MODE === "incremental") {
    fs.readdirSync(OUTPUT_DIR).forEach((f) => {
      if (f.endsWith(".xml") && f !== "sitemap.xml") {
        const existingUrlsFromFile = readExistingSitemap(
          path.join(OUTPUT_DIR, f)
        );
        existingUrlsFromFile.forEach((urlDataFromXml, locKey) => {
          const locPath = new URL(locKey).pathname;
          const entryLang =
            LANGUAGES.find((l) => locPath.startsWith(`/${l}/`)) ||
            DEFAULT_LANGUAGE;
          let derivedGroupingKey = null;

          for (const ct of CONTENT_TYPES_CONFIG) {
            if (
              ct.type === "collection" &&
              locPath.includes(`/${ct.pathPrefix}/`)
            ) {
              derivedGroupingKey = ct.apiSlug;
              break;
            } else if (ct.type === "single") {
              let expectedPathForSingle = getPageUrl(
                entryLang,
                ct.defaultUrlPath,
                "single"
              ).replace(SITE_BASE_URL, "");
              if (entryLang === DEFAULT_LANGUAGE && ct.defaultUrlPath === "") {
                expectedPathForSingle = "/";
              } else if (
                entryLang !== DEFAULT_LANGUAGE &&
                ct.defaultUrlPath === ""
              ) {
                expectedPathForSingle = `/${entryLang}`;
              }
              if (locPath === expectedPathForSingle) {
                derivedGroupingKey = ct.sitemapFileKeyBase;
                break;
              }
            }
          }
          if (!derivedGroupingKey) {
            let isHomepage = false;
            if (entryLang === DEFAULT_LANGUAGE && locPath === "/")
              isHomepage = true;
            else if (
              entryLang !== DEFAULT_LANGUAGE &&
              locPath === `/${entryLang}`
            )
              isHomepage = true;
            if (isHomepage) derivedGroupingKey = "single-pages";
          }

          if (derivedGroupingKey) {
            urlDataFromXml._sitemapFileKeyBaseForGrouping = derivedGroupingKey;
          } else {
            console.warn(
              `[INCREMENTAL LOAD WARN] Could not derive grouping key for existing URL: ${locKey}. Categorizing as other.`
            );
            urlDataFromXml._sitemapFileKeyBaseForGrouping =
              "other-uncategorized-pages";
          }
          allContentUrls.set(locKey, urlDataFromXml);
        });
      }
    });
    console.log(
      `Incremental: Loaded ${allContentUrls.size} existing URLs and derived grouping keys.`
    );
  }

  let fetchedSomethingNew = false;

  console.log("Adding/Updating homepage URLs manually...");
  LANGUAGES.forEach((lang) => {
    const homepageLoc = getPageUrl(lang, "", "single");
    allContentUrls.set(homepageLoc, {
      loc: homepageLoc,
      lastmod: new Date().toISOString(), // Homepage lastmod always current for simplicity
      changefreq: "daily",
      priority: "1.0",
      _sitemapFileKeyBaseForGrouping: "single-pages",
    });
    // console.log(`Added/Updated homepage for ${lang}: ${homepageLoc}`); // Less verbose
  });

  // Fetch new/updated items since last run (or all if no lastRunTimestamp for collections if incremental)
  for (const lang of LANGUAGES) {
    for (const contentType of CONTENT_TYPES_CONFIG) {
      const isSingleType = contentType.type === "single";
      let entriesFromStrapi = [];

      const fetchSince =
        SCRIPT_MODE === "incremental" && lastRunTimestamp
          ? lastRunTimestamp
          : null;

      if (isSingleType) {
        const singleEntry = await fetchStrapiSingleEntry(
          contentType.apiSlug,
          lang // Single types are always fetched fully or checked against cache, not using 'fetchSince' in fetchStrapiSingleEntry
        );
        if (singleEntry) {
          entriesFromStrapi.push(singleEntry);
          fetchedSomethingNew = true; // Mark that something was fetched/updated
        } else if (SCRIPT_MODE === "incremental") {
          // If not found and incremental, ensure removal from allContentUrls
          const locToRemove = getPageUrl(
            lang,
            contentType.defaultUrlPath,
            "single"
          );
          if (allContentUrls.has(locToRemove)) {
            allContentUrls.delete(locToRemove);
            console.log(
              `Incremental: Removed single page ${locToRemove} (not found/published in current fetch).`
            );
          }
        }
      } else {
        // Collection type
        const collectionEntries = await fetchStrapiCollectionEntries(
          contentType.apiSlug,
          lang,
          fetchSince // Pass sinceTimestamp for collections
        );
        if (collectionEntries.length > 0) fetchedSomethingNew = true;
        entriesFromStrapi.push(...collectionEntries);
      }

      entriesFromStrapi.forEach((entry) => {
        let pathSegment,
          itemSlug = null;
        if (isSingleType) {
          pathSegment =
            contentType.defaultUrlPath === "" && lang === DEFAULT_LANGUAGE
              ? ""
              : contentType.defaultUrlPath;
        } else {
          // Collection
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
        allContentUrls.set(currentLoc, {
          // This will add new or update existing
          loc: currentLoc,
          lastmod: new Date(
            entry.attributes.updatedAt || Date.now()
          ).toISOString(),
          changefreq: contentType.changefreq || "monthly",
          priority: contentType.priority || "0.5",
          _sitemapFileKeyBaseForGrouping: isSingleType
            ? contentType.sitemapFileKeyBase
            : contentType.apiSlug,
        });
      });
    }
  }

  // Deletion & Reconciliation for collections in incremental mode
  if (SCRIPT_MODE === "incremental" && lastRunTimestamp) {
    console.log(
      "Incremental: Full reconciliation for collections (deletions & updates)..."
    );
    const liveCollectionItemsData = new Map(); // Store {entry, contentType, language} for all live items

    // Fetch ALL live collection items
    for (const lang of LANGUAGES) {
      for (const ct of CONTENT_TYPES_CONFIG.filter(
        (c) => c.type === "collection"
      )) {
        const currentLiveItems = await fetchStrapiCollectionEntries(
          ct.apiSlug,
          lang,
          null // Full fetch
        );
        currentLiveItems.forEach((e) => {
          if (e.attributes.slug) {
            const loc = getPageUrl(
              lang,
              ct.pathPrefix,
              "collection",
              e.attributes.slug
            );
            liveCollectionItemsData.set(loc, {
              entry: e,
              contentType: ct,
              language: lang,
            });
          }
        });
      }
    }

    // Identify items in allContentUrls (from cache + new/updated) that are collections and no longer live
    const keysToDelete = [];
    allContentUrls.forEach((urlData, locKey) => {
      const isCollectionInMap = CONTENT_TYPES_CONFIG.some(
        (ct) =>
          ct.type === "collection" &&
          (urlData._sitemapFileKeyBaseForGrouping === ct.apiSlug || // Check derived key first
            locKey.includes(`/${ct.pathPrefix}/`)) // Fallback path check
      );
      if (isCollectionInMap && !liveCollectionItemsData.has(locKey)) {
        keysToDelete.push(locKey);
      }
    });

    if (keysToDelete.length > 0) {
      console.log(
        `Incremental: Removing ${keysToDelete.length} stale collection URLs from allContentUrls.`
      );
      keysToDelete.forEach((locKey) => allContentUrls.delete(locKey));
    }

    // Ensure all currently live collection items are in allContentUrls with their latest data
    liveCollectionItemsData.forEach((itemDetail, loc) => {
      const { entry, contentType, language: lang } = itemDetail;
      allContentUrls.set(loc, {
        loc: loc,
        lastmod: new Date(
          entry.attributes.updatedAt || Date.now()
        ).toISOString(),
        changefreq: contentType.changefreq || "monthly",
        priority: contentType.priority || "0.5",
        _sitemapFileKeyBaseForGrouping: contentType.apiSlug,
      });
    });
    console.log(
      `Incremental: Size of allContentUrls after collection reconciliation: ${allContentUrls.size}`
    );
  } // End of incremental collection reconciliation

  console.log(
    `>>>> Reached point just before Array.from(allContentUrls.values()). Size: ${allContentUrls.size}`
  );
  const finalUrls = Array.from(allContentUrls.values());
  const sitemapRegistry = [];
  const urlsByFileKey = new Map();

  finalUrls.forEach((urlData) => {
    let fileKey = "other-uncategorized-pages"; // Fallback
    const locPath = new URL(urlData.loc).pathname;
    const entryLang =
      LANGUAGES.find((l) => locPath.startsWith(`/${l}/`)) || DEFAULT_LANGUAGE;

    if (urlData._sitemapFileKeyBaseForGrouping) {
      fileKey = `${urlData._sitemapFileKeyBaseForGrouping}-${entryLang}`;
    } else {
      // This fallback should ideally not be hit if _sitemapFileKeyBaseForGrouping is always set
      console.warn(
        `[KEYING WARN FINAL] URL: ${urlData.loc} missing _sitemapFileKeyBaseForGrouping. Falling back to pathPrefix check.`
      );
      for (const ct of CONTENT_TYPES_CONFIG) {
        if (
          ct.type === "collection" &&
          locPath.includes(`/${ct.pathPrefix}/`)
        ) {
          fileKey = `${ct.apiSlug}-${entryLang}`;
          break;
        }
        // No need for single type check here if they all have _sitemapFileKeyBaseForGrouping
      }
    }

    if (!urlsByFileKey.has(fileKey)) urlsByFileKey.set(fileKey, []);
    urlsByFileKey.get(fileKey).push(urlData);
  });

  console.log(`Finished grouping. ${urlsByFileKey.size} sitemap groups.`);
  // This cleanup should happen for both full and incremental before writing new files
  fs.readdirSync(OUTPUT_DIR).forEach((f) => {
    if (f.endsWith(".xml") && f !== "sitemap.xml")
      try {
        fs.rmSync(path.join(OUTPUT_DIR, f));
      } catch (e) {
        console.warn(`Could not rm ${f}: ${e.message}`);
      }
  });
  console.log("Removed old sitemap parts (if any). Writing new ones...");

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

  // Save state only if something was actually fetched as new/updated, or if it's a full run,
  // or if it's an incremental run that had no prior state (effectively a full run for the purpose of state).
  if (
    SCRIPT_MODE === "full" ||
    (SCRIPT_MODE === "incremental" && fetchedSomethingNew) ||
    (SCRIPT_MODE === "incremental" && !lastRunTimestamp)
  ) {
    saveLastRunState(startTime);
  } else if (SCRIPT_MODE === "incremental" && lastRunTimestamp) {
    console.log(
      "Incremental run: No new/updated items fetched, state timestamp not updated."
    );
  }

  console.log(
    `Sitemap gen (${SCRIPT_MODE}) finished in ${
      (Date.now() - startTime) / 1000
    }s!`
  );
} // End of main()

main().catch((error) => {
  console.error(`Sitemap gen (${SCRIPT_MODE}) FAILED:`, error);
  console.error("Stack:", error.stack);
  process.exit(1);
});
