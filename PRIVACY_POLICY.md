# Privacy Policy

Effective date: February 18, 2026

This Privacy Policy describes how `rss-post-bot` (the "App") collects, uses, stores, and discloses information when used on Reddit.

## 1. Information We Process

When installed and used, the App may process:

- installation settings configured by moderators (for example feed URL, target subreddit, post options),
- RSS/Atom feed content from configured sources (for example item title, link, description),
- operational identifiers needed to prevent duplicate posts (for example feed item fingerprints/checkpoints),
- subreddit and app context metadata provided by Reddit for execution, and
- application logs for debugging and reliability.

The App is designed to store minimal operational data required for posting and deduplication.

## 2. How We Use Information

We use processed information to:

- fetch and parse configured feed content,
- generate and submit Reddit posts per your settings,
- schedule and run recurring polling jobs, and
- maintain state to avoid reposting already-processed items.

## 3. Data Storage and Retention

The App stores operational state in Reddit-provided app storage (for example Redis/KV) associated with the installation.

Retention is tied to operational need and app lifecycle. Data may persist until overwritten, app removal, or infrastructure-level deletion.

## 4. Information Sharing

We do not sell personal information.

Information may be shared only as necessary to operate the App, including:

- with Reddit platform services and APIs,
- with configured feed hosts when fetching content, and
- with service providers used by Reddit/Devvit infrastructure.

## 5. Legal Basis and Compliance

If applicable law requires a legal basis for processing (for example GDPR/UK GDPR), processing is performed for legitimate interests in operating moderation automation requested by the installer, and/or to perform services requested by the user.

## 6. Security

Reasonable administrative and technical measures are used to reduce risk of unauthorized access, loss, misuse, or alteration of data. No method of storage or transmission is fully secure.

## 7. Your Choices

You can stop processing by:

- uninstalling the App from a subreddit,
- removing or changing configured settings, or
- disabling scheduled use of the App.

## 8. Children's Privacy

The App is not directed to children under 13 (or higher age threshold where required by local law).

## 9. International Transfers

Because Reddit services may operate globally, information may be processed in countries other than your own, subject to Reddit's infrastructure and policies.

## 10. Changes to This Policy

This Privacy Policy may be updated from time to time. Continued use of the App after publication of updates means you accept the revised policy.

## 11. Contact

For privacy questions or requests, contact: <https://github.com/jghaines/devvit-rss-to-post-bot/discussions>
