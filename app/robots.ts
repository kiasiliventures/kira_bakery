import type { MetadataRoute } from "next";
import { getAbsoluteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/menu", "/contact", "/cake-builder", "/classes", "/terms", "/privacy"],
        disallow: ["/account/", "/api/", "/cart", "/orders/", "/payment/"],
      },
    ],
    sitemap: getAbsoluteUrl("/sitemap.xml"),
  };
}
