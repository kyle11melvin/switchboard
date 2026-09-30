/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // The slide renderer reads its font files at run time, so they have to ship with that function.
  outputFileTracingIncludes: { "/api/slide": ["./app/api/slide/fonts/*.woff"] },
};
