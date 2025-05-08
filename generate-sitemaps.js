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
    priority: "0.7",
    changefreq: "weekly",
  },
  {
    type: "collection",
    apiSlug: "news-articles",
    pathPrefix: "news",
    priority: "0.8",
    changefreq: "daily",
  },
  {
    type: "collection",
    apiSlug: "blog-posts",
    pathPrefix: "blog",
    priority: "0.6",
    changefreq: "monthly",
  },

  // Single Types (Ensure apiSlug matches the API ID in Strapi)
  // defaultUrlPath is the URL segment for the default language. For homepage, it's ''.
  // These single types are assumed NOT to use a custom 'slug' field from Strapi for their URL path.
  {
    type: "single",
    apiSlug: "home-page",
    defaultUrlPath: "",
    priority: "1.0",
    changefreq: "daily",
  },
  {
    type: "single",
    apiSlug: "about-page",
    defaultUrlPath: "about",
    priority: "0.5",
    changefreq: "yearly",
  },
  {
    type: "single",
    apiSlug: "cancellation-policy",
    defaultUrlPath: "cancellation-policy",
    priority: "0.3",
    changefreq: "yearly",
  },
  {
    type: "single",
    apiSlug: "contact-page",
    defaultUrlPath: "contact",
    priority: "0.5",
    changefreq: "yearly",
  },
  {
    type: "single",
    apiSlug: "disclaimer",
    defaultUrlPath: "disclaimer",
    priority: "0.3",
    changefreq: "yearly",
  },
  {
    type: "single",
    apiSlug: "legal",
    defaultUrlPath: "legal",
    priority: "0.3",
    changefreq: "yearly",
  },
  {
    type: "single",
    apiSlug: "privacy-policy",
    defaultUrlPath: "privacy-policy",
    priority: "0.3",
    changefreq: "yearly",
  },
  {
    type: "single",
    apiSlug: "services-page",
    defaultUrlPath: "services",
    priority: "0.7",
    changefreq: "monthly",
  },
  {
    type: "single",
    apiSlug: "t-and-c",
    defaultUrlPath: "terms-and-conditions",
    priority: "0.3",
    changefreq: "yearly",
  },
];

const OUTPUT_DIR = process.env.SITEMAP_OUTPUT_DIR;
const SITEMAP_URL_LIMIT = 45000;
const STRAPI_PAGE_SIZE = 100;
const STATE_FILE_PATH = path.join(OUTPUT_DIR, "sitemap_state.json");

const SCRIPT_MODE = process.env.SITEMAP_GENERATION_MODE || "full";

if (!STRAPI_API_URL || !STRAPI_API_TOKEN || !SITE_BASE_URL || !OUTPUT_DIR) {
  console.error(
    "Error: Missing required environment variables (STRAPI_API_URL, STRAPI_API_TOKEN, SITE_BASE_URL, SITEMAP_OUTPUT_DIR)."
  );
  process.exit(1);
}

const axiosInstance = axios.create({
  baseURL: STRAPI_API_URL,
  headers: { Authorization: `Bearer ${STRAPI_API_TOKEN}` },
});

// --- Helper Functions ---

function getPageUrl(
  language,
  pathSegment,
  itemType = "collection",
  slugIfCollection = null
) {
  const langPrefix =
    language === DEFAULT_LANGUAGE || language === "" ? "" : `/${language}`;

  if (itemType === "single") {
    if (
      pathSegment === "" ||
      pathSegment === null ||
      typeof pathSegment === "undefined"
    ) {
      return langPrefix === ""
        ? `${SITE_BASE_URL}/`
        : `${SITE_BASE_URL}${langPrefix}`;
    }
    return `${SITE_BASE_URL}${langPrefix}/${pathSegment}`;
  } else {
    // collection
    return `${SITE_BASE_URL}${langPrefix}/${pathSegment}/${slugIfCollection}`;
  }
}

function generateSitemapXML(urls) {
  const root = create({ version: "1.0", encoding: "UTF-8" }).ele("urlset", {
    xmlns: "http://www.sitemaps.org/schemas/sitemap/0.9",
    "xmlns:xhtml": "http://www.w3.org/1999/xhtml",
  });
  urls.forEach((urlData) => {
    const urlElement = root.ele("url");
    urlElement.ele("loc").txt(urlData.loc);
    if (urlData.lastmod) urlElement.ele("lastmod").txt(urlData.lastmod);
    if (urlData.changefreq)
      urlElement.ele("changefreq").txt(urlData.changefreq);
    if (urlData.priority) urlElement.ele("priority").txt(urlData.priority);
    if (urlData.alternates && urlData.alternates.length > 0) {
      urlData.alternates.forEach((alt) => {
        urlElement.ele("xhtml:link", {
          rel: "alternate",
          hreflang: alt.hreflang,
          href: alt.href,
        });
      });
    }
  });
  return root.end({ prettyPrint: true });
}

function generateSitemapIndexXML(sitemapLocations) {
  const root = create({ version: "1.0", encoding: "UTF-8" }).ele(
    "sitemapindex",
    { xmlns: "http://www.sitemaps.org/schemas/sitemap/0.9" }
  );
  sitemapLocations.forEach((locData) => {
    const sitemapElement = root.ele("sitemap");
    sitemapElement.ele("loc").txt(locData.loc);
    if (locData.lastmod) sitemapElement.ele("lastmod").txt(locData.lastmod);
  });
  return root.end({ prettyPrint: true });
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
            if (child.node.nodeName === "xhtml:link") {
              alternates.push({
                hreflang: child.node.getAttribute("hreflang"),
                href: child.node.getAttribute("href"),
              });
            }
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
    `Fetching collection ${contentTypeApiSlug} for language: ${language}${
      sinceTimestamp
        ? ` since ${new Date(sinceTimestamp).toISOString()}`
        : " (full fetch)"
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

  if (sinceTimestamp) {
    params["filters[updatedAt][$gt]"] = new Date(sinceTimestamp).toISOString();
  }

  try {
    do {
      params["pagination[page]"] = page;
      const response = await axiosInstance.get(`/api/${contentTypeApiSlug}`, {
        params,
      });
      if (response.data && response.data.data) {
        allEntries = allEntries.concat(response.data.data);
        if (page === 1 && response.data.meta && response.data.meta.pagination) {
          totalPages = response.data.meta.pagination.pageCount;
        }
        console.log(
          `Fetched page ${page}/${totalPages} for ${contentTypeApiSlug} (${language}) - ${response.data.data.length} items`
        );
      } else {
        break;
      }
      page++;
    } while (page <= totalPages);
  } catch (error) {
    console.error(
      `Error fetching Strapi collection entries for ${contentTypeApiSlug} (${language}):`,
      error.response ? error.response.data : error.message
    );
  }
  console.log(
    `Finished fetching collection ${contentTypeApiSlug} for ${language}. Total entries: ${allEntries.length}`
  );
  return allEntries;
}

async function fetchStrapiSingleEntry(singleTypeApiSlug, language) {
  console.log(
    `Fetching single type ${singleTypeApiSlug} for language: ${language}`
  );
  try {
    const params = {
      locale: language,
      "populate[localizations][fields][0]": "locale", // Only need locale from localizations for path construction
      "fields[0]": "updatedAt",
      "fields[1]": "locale",
      "fields[2]": "publishedAt",
      publicationState: "live",
    };

    const response = await axiosInstance.get(`/api/${singleTypeApiSlug}`, {
      params,
    });

    if (
      response.data &&
      response.data.data &&
      response.data.data.attributes &&
      response.data.data.attributes.publishedAt
    ) {
      return response.data.data;
    } else {
      console.log(
        `Single type ${singleTypeApiSlug} (${language}) not found or not published.`
      );
      return null;
    }
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log(
        `Single type ${singleTypeApiSlug} (${language}) not found (404).`
      );
    } else if (
      error.response &&
      error.response.data &&
      error.response.data.error
    ) {
      console.error(
        `Error fetching Strapi single entry ${singleTypeApiSlug} (${language}): Status ${error.response.data.error.status} - ${error.response.data.error.message}`
      );
    } else {
      console.error(
        `Error fetching Strapi single entry ${singleTypeApiSlug} (${language}):`,
        error.message
      );
    }
    return null;
  }
}

function loadLastRunState() {
  if (fs.existsSync(STATE_FILE_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE_PATH, "utf-8"));
    } catch (e) {
      console.warn("Could not read/parse sitemap_state.json:", e.message);
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
    console.log(
      `Saved last successful run timestamp: ${new Date(
        timestamp
      ).toISOString()}`
    );
  } catch (e) {
    console.error("Could not write sitemap_state.json:", e.message);
  }
}

// --- Main Logic ---
async function main() {
  console.log(`Starting sitemap generation in "${SCRIPT_MODE}" mode...`);
  const startTime = Date.now();
  let lastRunTimestamp = null;

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  if (SCRIPT_MODE === "full") {
    console.log("Full mode: Cleaning existing sitemap files and state.");
    fs.readdirSync(OUTPUT_DIR).forEach((f) => {
      if (f.endsWith(".xml") || f === "sitemap_state.json") {
        try {
          fs.rmSync(path.join(OUTPUT_DIR, f));
        } catch (e) {
          console.warn(`Could not remove ${f}: ${e.message}`);
        }
      }
    });
  } else {
    const state = loadLastRunState();
    lastRunTimestamp = state.lastSuccessfulRunTimestamp;
    if (lastRunTimestamp)
      console.log(
        `Incremental mode: Last successful run was at ${new Date(
          lastRunTimestamp
        ).toISOString()}`
      );
    else
      console.warn(
        "Incremental mode: No last run timestamp. Consider running 'full' mode first or will perform a full-like fetch for incremental."
      );
  }

  const allContentUrls = new Map();

  if (SCRIPT_MODE === "incremental") {
    fs.readdirSync(OUTPUT_DIR).forEach((file) => {
      if (file.endsWith(".xml") && file !== "sitemap.xml") {
        const existingUrls = readExistingSitemap(path.join(OUTPUT_DIR, file));
        existingUrls.forEach((value, key) => allContentUrls.set(key, value));
      }
    });
    console.log(
      `Incremental: Loaded ${allContentUrls.size} existing URLs from all sitemap files.`
    );
  }

  let fetchedSomethingNew = false;

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
              `Incremental: Removed single type URL ${locToRemove} as it's no longer found/published.`
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
        let pathForUrlConstruction,
          itemSlugForCollection = null;
        if (isSingleType) {
          pathForUrlConstruction = contentType.defaultUrlPath; // Always use defaultUrlPath for single types now
          if (contentType.defaultUrlPath === "" && lang === DEFAULT_LANGUAGE)
            pathForUrlConstruction = "";
        } else {
          pathForUrlConstruction = contentType.pathPrefix;
          if (!entry.attributes.slug) {
            console.warn(
              `Collection entry ID ${entry.id} (${contentType.apiSlug}, ${lang}) missing slug. Skipping.`
            );
            return;
          }
          itemSlugForCollection = entry.attributes.slug;
        }

        const currentLoc = getPageUrl(
          lang,
          pathForUrlConstruction,
          isSingleType ? "single" : "collection",
          itemSlugForCollection
        );
        const alternates = [{ hreflang: lang, href: currentLoc }];

        if (
          entry.attributes.localizations &&
          entry.attributes.localizations.data
        ) {
          entry.attributes.localizations.data.forEach((locEntry) => {
            const altLocale = locEntry.attributes.locale;
            let altPathSegment,
              altSlugIfCollection = null;
            if (isSingleType) {
              altPathSegment = contentType.defaultUrlPath; // Use defaultUrlPath for alternates too
              if (
                contentType.defaultUrlPath === "" &&
                altLocale !== DEFAULT_LANGUAGE &&
                altLocale !== ""
              )
                altPathSegment = "";
            } else {
              altPathSegment = contentType.pathPrefix;
              if (!locEntry.attributes.slug) return;
              altSlugIfCollection = locEntry.attributes.slug;
            }
            if (altLocale) {
              alternates.push({
                hreflang: altLocale,
                href: getPageUrl(
                  altLocale,
                  altPathSegment,
                  isSingleType ? "single" : "collection",
                  altSlugIfCollection
                ),
              });
            }
          });
        }
        allContentUrls.set(currentLoc, {
          loc: currentLoc,
          lastmod: entry.attributes.updatedAt
            ? new Date(entry.attributes.updatedAt).toISOString()
            : new Date().toISOString(),
          changefreq: contentType.changefreq || "monthly",
          priority: contentType.priority || "0.5",
          alternates: alternates,
        });
      });
    }
  }

  if (SCRIPT_MODE === "incremental" && lastRunTimestamp) {
    console.log("Incremental: Performing deletion checks for collections...");
    const liveCollectionItemLocs = new Set();
    for (const lang of LANGUAGES) {
      for (const contentType of CONTENT_TYPES_CONFIG.filter(
        (ct) => ct.type === "collection"
      )) {
        const allCurrentLiveEntries = await fetchStrapiCollectionEntries(
          contentType.apiSlug,
          lang,
          null
        );
        allCurrentLiveEntries.forEach((entry) => {
          if (entry.attributes.slug) {
            liveCollectionItemLocs.add(
              getPageUrl(
                lang,
                contentType.pathPrefix,
                "collection",
                entry.attributes.slug
              )
            );
          }
        });
      }
    }

    const urlsToDelete = [];
    allContentUrls.forEach((urlData, locKey) => {
      const isPotentiallyCollection = CONTENT_TYPES_CONFIG.some(
        (ct) =>
          ct.type === "collection" && locKey.includes(`/${ct.pathPrefix}/`)
      );
      if (isPotentiallyCollection && !liveCollectionItemLocs.has(locKey)) {
        urlsToDelete.push(locKey);
      }
    });

    if (urlsToDelete.length > 0) {
      console.log(
        `Incremental: Found ${urlsToDelete.length} collection URLs to remove.`
      );
      urlsToDelete.forEach((locKey) => allContentUrls.delete(locKey));
    }
  }

  const finalUrlListForAllSitemaps = Array.from(allContentUrls.values());
  const sitemapFileRegistry = [];
  const urlsBySitemapFileKey = new Map();

  finalUrlListForAllSitemaps.forEach((urlData) => {
    let fileKey = "other-pages";
    const locPath = new URL(urlData.loc).pathname;
    const currentEntryLang =
      LANGUAGES.find((l) => locPath.startsWith(`/${l}/`)) || DEFAULT_LANGUAGE;

    for (const ct of CONTENT_TYPES_CONFIG) {
      if (ct.type === "collection" && locPath.includes(`/${ct.pathPrefix}/`)) {
        fileKey = `${ct.apiSlug}-${currentEntryLang}`;
        break;
      } else if (ct.type === "single") {
        let expectedPathForSingle = getPageUrl(
          currentEntryLang,
          ct.defaultUrlPath,
          "single"
        ).replace(SITE_BASE_URL, "");
        if (currentEntryLang === DEFAULT_LANGUAGE && ct.defaultUrlPath === "") {
          // Homepage default lang
          expectedPathForSingle = "/";
        } else if (
          currentEntryLang !== DEFAULT_LANGUAGE &&
          ct.defaultUrlPath === ""
        ) {
          // Homepage other lang
          expectedPathForSingle = `/${currentEntryLang}`;
        }

        if (locPath === expectedPathForSingle) {
          fileKey = `single-${ct.apiSlug}-${currentEntryLang}`;
          break;
        }
      }
    }
    if (!urlsBySitemapFileKey.has(fileKey))
      urlsBySitemapFileKey.set(fileKey, []);
    urlsBySitemapFileKey.get(fileKey).push(urlData);
  });

  fs.readdirSync(OUTPUT_DIR).forEach((f) => {
    if (f.endsWith(".xml") && f !== "sitemap.xml") {
      try {
        fs.rmSync(path.join(OUTPUT_DIR, f));
      } catch (e) {
        console.warn(`Could not remove old sitemap part ${f}: ${e.message}`);
      }
    }
  });

  urlsBySitemapFileKey.forEach((urlList, fileKeyBase) => {
    for (let i = 0; i < urlList.length; i += SITEMAP_URL_LIMIT) {
      const chunk = urlList.slice(i, i + SITEMAP_URL_LIMIT);
      const partSuffix =
        urlList.length > SITEMAP_URL_LIMIT
          ? `-${Math.floor(i / SITEMAP_URL_LIMIT) + 1}`
          : "";
      const sitemapFilename = `${fileKeyBase}${partSuffix}.xml`;
      const sitemapFilepath = path.join(OUTPUT_DIR, sitemapFilename);

      const xmlContent = generateSitemapXML(chunk);
      fs.writeFileSync(sitemapFilepath, xmlContent);
      console.log(
        `Generated sitemap: ${sitemapFilename} with ${chunk.length} URLs`
      );
      sitemapFileRegistry.push({
        loc: `${SITE_BASE_URL}/sitemaps/${sitemapFilename}`,
        lastmod: new Date().toISOString(),
      });
    }
  });

  if (sitemapFileRegistry.length > 0) {
    const indexXmlContent = generateSitemapIndexXML(sitemapFileRegistry);
    fs.writeFileSync(path.join(OUTPUT_DIR, "sitemap.xml"), indexXmlContent);
    console.log(
      `Generated sitemap index: sitemap.xml with ${sitemapFileRegistry.length} sitemap file(s)`
    );
  } else {
    console.log(
      "No sitemap files generated. Removing sitemap.xml if it exists."
    );
    if (fs.existsSync(path.join(OUTPUT_DIR, "sitemap.xml"))) {
      fs.rmSync(path.join(OUTPUT_DIR, "sitemap.xml"));
    }
  }

  if (
    SCRIPT_MODE === "full" ||
    (SCRIPT_MODE === "incremental" && fetchedSomethingNew) ||
    (SCRIPT_MODE === "incremental" && !lastRunTimestamp)
  ) {
    saveLastRunState(startTime);
  }

  console.log(
    `Sitemap generation (${SCRIPT_MODE}) finished in ${
      (Date.now() - startTime) / 1000
    }s!`
  );
}

main().catch((error) => {
  console.error(`Sitemap generation (${SCRIPT_MODE}) failed:`, error);
  process.exit(1);
});
