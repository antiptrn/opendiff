export function PrivacyPolicyPage() {
  return (
    <section className="relative lg:pt-40 md:pt-40 pt-32 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto pb-20">
      <h1 className="text-4xl font-medium tracking-tight mb-2">
        Privacy Policy
      </h1>
      <p className="text-muted-foreground mb-12">
        Last updated: February 16, 2026
      </p>

      <div className="prose prose-invert max-w-none space-y-10 text-muted-foreground [&_h2]:text-foreground [&_h2]:text-2xl [&_h2]:font-medium [&_h2]:tracking-tight [&_h2]:mb-4 [&_h3]:text-foreground [&_h3]:text-lg [&_h3]:font-medium [&_h3]:mb-2 [&_p]:leading-7 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2 [&_li]:leading-7 [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-muted-foreground">
        <div>
          <h2>1. Introduction</h2>
          <p>
            OpenDiff ("we", "us", or "our") operates the OpenDiff platform, an
            AI-powered code review service ("Service"). This Privacy Policy
            explains how we collect, use, disclose, and safeguard your
            information when you use our Service. By accessing or using the
            Service, you consent to the practices described in this policy.
          </p>
          <p>
            If you do not agree with the terms of this Privacy Policy, please do
            not access or use the Service.
          </p>
        </div>

        <div>
          <h2>2. Information We Collect</h2>
          <h3>Account Information</h3>
          <p>
            When you create an account, we collect information provided by your
            OAuth provider (GitHub, Google, or Microsoft), which may include:
          </p>
          <ul>
            <li>Name and display name</li>
            <li>Email address</li>
            <li>Profile picture URL</li>
            <li>OAuth provider account identifier</li>
          </ul>
          <h3>Organization Information</h3>
          <p>
            If you create or join an organization on OpenDiff, we collect
            organization names, member roles, and seat allocation data necessary
            to manage team access and billing.
          </p>
          <h3>Source Code</h3>
          <p>
            When you use the Service to review pull requests, we temporarily
            access the code diffs and related metadata (file names, commit
            messages, branch names) from your GitHub repositories. Source code is
            processed in memory for the duration of a review and is not
            persisted beyond what is necessary to deliver review results.
          </p>
          <h3>Usage Data</h3>
          <p>
            We automatically collect information about how you interact with the
            Service, including:
          </p>
          <ul>
            <li>Pages visited and features used</li>
            <li>Review history and statistics (e.g., number of issues found, severity counts)</li>
            <li>Token consumption and billing-related usage metrics</li>
            <li>Browser type, operating system, and device information</li>
            <li>IP address and approximate geographic location</li>
            <li>Timestamps of requests and interactions</li>
          </ul>
          <h3>Cookies and Local Storage</h3>
          <p>
            We use cookies and browser local storage to maintain your
            authenticated session, remember your theme preferences, and cache
            non-sensitive data (such as GitHub star counts) to improve
            performance. We do not use third-party advertising or tracking
            cookies.
          </p>
        </div>

        <div>
          <h2>3. How We Use Your Information</h2>
          <p>We use the information we collect to:</p>
          <ul>
            <li>Provide, operate, and maintain the Service</li>
            <li>Authenticate your identity and manage your account</li>
            <li>Process AI-powered code reviews on your pull requests</li>
            <li>Manage organization membership, roles, and invitations</li>
            <li>Process payments and manage subscriptions</li>
            <li>Generate aggregated review statistics and usage dashboards</li>
            <li>Send transactional notifications (e.g., review completed, invitation received)</li>
            <li>Detect and prevent fraud, abuse, and security incidents</li>
            <li>Improve and develop new features for the Service</li>
            <li>Comply with legal obligations</li>
          </ul>
        </div>

        <div>
          <h2>4. Third-Party Services</h2>
          <p>
            We share information with the following categories of third-party
            service providers, solely to the extent necessary to operate the
            Service:
          </p>
          <ul>
            <li>
              <strong>AI Providers</strong> — Code diffs are sent to Anthropic
              for AI-powered analysis. If you use the Self-sufficient plan with
              your own API key, your code is sent directly to Anthropic under
              your own account and API terms.
            </li>
            <li>
              <strong>GitHub</strong> — We interact with the GitHub API to read
              pull request data, post review comments, and commit automated
              fixes on your behalf via our GitHub App integration.
            </li>
            <li>
              <strong>Payment Processors</strong> — Subscription and billing
              data is processed by our payment provider (Polar or Stripe,
              depending on configuration). We do not store full credit card
              numbers on our servers.
            </li>
            <li>
              <strong>Cloud Infrastructure</strong> — We use cloud hosting and
              storage providers (including Cloudflare R2) to host the Service
              and store assets.
            </li>
          </ul>
          <p>
            We do not sell your personal information to third parties. We do not
            share your source code with any party other than AI providers for
            the sole purpose of performing code reviews.
          </p>
        </div>

        <div>
          <h2>5. Data Retention</h2>
          <ul>
            <li>
              <strong>Source code</strong> is processed transiently and is not
              stored after a review is completed, unless a feature you have
              enabled explicitly requires temporary retention.
            </li>
            <li>
              <strong>Review results</strong> (comments, severity, category,
              fix metadata) are retained as part of your review history for as
              long as your account or organization is active.
            </li>
            <li>
              <strong>Account information</strong> is retained for the duration
              of your account. If you delete your account, we will remove your
              personal data within 30 days, except where retention is required
              by law or for legitimate business purposes (e.g., billing
              records).
            </li>
            <li>
              <strong>Audit logs</strong> are retained for security and
              compliance purposes and may be kept for up to 12 months.
            </li>
          </ul>
        </div>

        <div>
          <h2>6. Data Security</h2>
          <p>
            We implement industry-standard technical and organizational measures
            to protect your information, including:
          </p>
          <ul>
            <li>Encryption of data in transit using TLS</li>
            <li>Secure OAuth-based authentication with no password storage</li>
            <li>Role-based access controls within organizations</li>
            <li>Regular security reviews and audit logging</li>
          </ul>
          <p>
            While we strive to protect your information, no method of
            transmission or storage is 100% secure. We cannot guarantee absolute
            security of your data.
          </p>
        </div>

        <div>
          <h2>7. Your Rights</h2>
          <p>
            Depending on your jurisdiction, you may have the following rights
            regarding your personal data:
          </p>
          <ul>
            <li>
              <strong>Access</strong> — Request a copy of the personal data we
              hold about you.
            </li>
            <li>
              <strong>Correction</strong> — Request correction of inaccurate or
              incomplete personal data.
            </li>
            <li>
              <strong>Deletion</strong> — Request deletion of your personal
              data, subject to legal retention requirements.
            </li>
            <li>
              <strong>Portability</strong> — Request a machine-readable export
              of your personal data.
            </li>
            <li>
              <strong>Objection</strong> — Object to certain types of
              processing, such as direct marketing.
            </li>
            <li>
              <strong>Withdrawal of Consent</strong> — Where processing is based
              on consent, you may withdraw it at any time.
            </li>
          </ul>
          <p>
            To exercise any of these rights, please contact us at{" "}
            <a href="mailto:support@opendiff.dev">support@opendiff.dev</a>. We
            will respond to your request within 30 days.
          </p>
        </div>

        <div>
          <h2>8. International Data Transfers</h2>
          <p>
            Your information may be transferred to and processed in countries
            other than your country of residence, including the United States.
            These countries may have data protection laws that differ from your
            jurisdiction. By using the Service, you consent to such transfers.
            We take appropriate safeguards to ensure your data is protected in
            accordance with this Privacy Policy.
          </p>
        </div>

        <div>
          <h2>9. Children's Privacy</h2>
          <p>
            The Service is not intended for individuals under the age of 16. We
            do not knowingly collect personal information from children. If we
            become aware that we have collected data from a child under 16, we
            will take steps to delete that information promptly. If you believe a
            child has provided us with personal data, please contact us at{" "}
            <a href="mailto:support@opendiff.dev">support@opendiff.dev</a>.
          </p>
        </div>

        <div>
          <h2>10. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. If we make
            material changes, we will notify you by updating the "Last updated"
            date at the top of this page and, where appropriate, providing
            additional notice through the Service. Your continued use of the
            Service after changes are posted constitutes acceptance of the
            revised policy.
          </p>
        </div>

        <div>
          <h2>11. Contact</h2>
          <p>
            If you have any questions or concerns about this Privacy Policy or
            our data practices, please contact us at{" "}
            <a href="mailto:support@opendiff.dev">support@opendiff.dev</a>.
          </p>
        </div>
      </div>
    </section>
  );
}
