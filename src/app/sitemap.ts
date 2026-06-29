import { MetadataRoute } from "next";

const BASE_URL = "https://www.aireintel.org";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/pipeline`,   lastModified: new Date(), changeFrequency: "daily",  priority: 0.9 },
    { url: `${BASE_URL}/contacts`,   lastModified: new Date(), changeFrequency: "daily",  priority: 0.9 },
    { url: `${BASE_URL}/market`,     lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/today`,      lastModified: new Date(), changeFrequency: "daily",  priority: 0.8 },
    { url: `${BASE_URL}/brief`,      lastModified: new Date(), changeFrequency: "daily",  priority: 0.7 },
    { url: `${BASE_URL}/create-post`,lastModified: new Date(), changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE_URL}/social`,     lastModified: new Date(), changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE_URL}/smart-plans`,lastModified: new Date(), changeFrequency: "weekly", priority: 0.5 },
  ];
}
