This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## SEO automation setup

The weekly SEO audit runs every Monday through GitHub Actions and emails
`ADMIN_EMAIL` when Resend is configured. It always checks listing quality;
adding the variables below also enables Search Console reporting and automatic
Google Indexing API notifications for new, eligible `JobPosting` pages:

```bash
GOOGLE_SERVICE_ACCOUNT_EMAIL="service-account@project.iam.gserviceaccount.com"
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"
GOOGLE_SEARCH_CONSOLE_SITE_URL="https://oppidx.com/"
```

One-time Google setup:

1. Verify the production site in Google Search Console and add the service
   account as a user of that property.
2. Enable the Google Indexing API for the service account's Google Cloud
   project.
3. Set the variables in the deployment environment. Without them, scraping
   and the weekly content-quality audit remain fully operational; only the
   Google API calls are skipped.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
