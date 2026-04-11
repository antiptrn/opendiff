export function TermsOfServicePage() {
  return (
    <section className="relative lg:pt-40 md:pt-40 pt-32 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto pb-20">
      <h1 className="text-4xl font-medium tracking-tight mb-2">
        Terms of Service
      </h1>
      <p className="text-muted-foreground mb-12">
        Last updated: February 15, 2026
      </p>

      <div className="prose prose-invert max-w-none space-y-10 text-muted-foreground [&_h2]:text-foreground [&_h2]:text-2xl [&_h2]:font-medium [&_h2]:tracking-tight [&_h2]:mb-4 [&_h3]:text-foreground [&_h3]:text-lg [&_h3]:font-medium [&_h3]:mb-2 [&_p]:leading-7 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2 [&_li]:leading-7 [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-muted-foreground">
        <div>
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using the OpenDiff platform ("Service"), operated by
            OpenDiff ("we", "us", or "our"), you agree to be bound by these
            Terms of Service ("Terms"). If you do not agree to these Terms, you
            may not access or use the Service.
          </p>
          <p>
            These Terms apply to all visitors, users, and others who access the
            Service. By using the Service on behalf of an organization, you
            represent and warrant that you have the authority to bind that
            organization to these Terms.
          </p>
        </div>

        <div>
          <h2>2. Description of Service</h2>
          <p>
            OpenDiff is an AI-powered code review platform that integrates with
            GitHub to provide automated pull request reviews, anti-pattern
            detection, security analysis, and code quality feedback. The Service
            includes:
          </p>
          <ul>
            <li>Automated code review of pull requests using AI</li>
            <li>Detection of security vulnerabilities, anti-patterns, performance issues, and bugs</li>
            <li>Automated issue triage and fix suggestions</li>
            <li>Custom review rules and skill configuration</li>
            <li>Organization and team management features</li>
          </ul>
        </div>

        <div>
          <h2>3. Accounts and Registration</h2>
          <p>
            To use the Service, you must create an account by authenticating
            through a supported OAuth provider (e.g., GitHub, Google, or
            Microsoft). You are responsible for maintaining the security of your
            account credentials and for all activities that occur under your
            account.
          </p>
          <p>
            You agree to notify us immediately of any unauthorized use of your
            account. We are not liable for any loss or damage arising from your
            failure to protect your account credentials.
          </p>
        </div>

        <div>
          <h2>4. Subscriptions and Billing</h2>
          <p>
            OpenDiff offers multiple subscription tiers with varying token
            quotas and feature sets. By subscribing to a paid plan, you agree to
            pay the applicable fees as described at the time of purchase.
          </p>
          <ul>
            <li>
              Subscription fees are billed in advance on a monthly or annual
              basis depending on the billing cycle you select.
            </li>
            <li>
              All fees are non-refundable except as required by applicable law
              or as explicitly stated in our refund policy.
            </li>
            <li>
              We reserve the right to change pricing with 30 days' notice.
              Continued use of the Service after a price change constitutes
              acceptance of the new pricing.
            </li>
            <li>
              If you provide your own API key under the Self-sufficient plan,
              you are solely responsible for any costs incurred through your API
              provider.
            </li>
          </ul>
        </div>

        <div>
          <h2>5. Acceptable Use</h2>
          <p>You agree not to use the Service to:</p>
          <ul>
            <li>
              Violate any applicable laws, regulations, or third-party rights
            </li>
            <li>
              Submit or process code that you do not have the right to analyze
            </li>
            <li>
              Attempt to reverse engineer, decompile, or extract the source code
              of our AI models or proprietary systems
            </li>
            <li>
              Interfere with or disrupt the integrity or performance of the
              Service
            </li>
            <li>
              Use the Service to develop a competing product or service
            </li>
            <li>
              Circumvent any usage limits, rate limits, or access controls
            </li>
            <li>
              Share account credentials or allow unauthorized third parties to
              access your account
            </li>
          </ul>
        </div>

        <div>
          <h2>6. Intellectual Property</h2>
          <h3>Your Code</h3>
          <p>
            You retain all ownership rights to the code you submit for review.
            By using the Service, you grant us a limited, non-exclusive license
            to access and analyze your code solely for the purpose of providing
            the Service. We do not claim ownership of your code and will not use
            it for purposes unrelated to delivering the Service.
          </p>
          <h3>Our Service</h3>
          <p>
            The Service, including its design, features, AI models, and
            documentation, is owned by OpenDiff and protected by intellectual
            property laws. These Terms do not grant you any rights to our
            trademarks, logos, or branding.
          </p>
          <h3>Feedback</h3>
          <p>
            If you provide us with feedback, suggestions, or ideas, you grant us
            an unrestricted, perpetual, irrevocable license to use and
            incorporate that feedback without any obligation to you.
          </p>
        </div>

        <div>
          <h2>7. Data and Privacy</h2>
          <p>
            Our collection and use of personal information is governed by our{" "}
            <a href="/privacy">Privacy Policy</a>. By using the Service, you
            consent to the collection and use of information as described
            therein.
          </p>
          <p>
            Code submitted for review is processed by our AI systems and may be
            sent to third-party AI providers (e.g., Anthropic) for analysis. We
            do not store your source code beyond the duration necessary to
            complete a review, unless you have explicitly enabled features that
            require longer retention.
          </p>
        </div>

        <div>
          <h2>8. Third-Party Integrations</h2>
          <p>
            The Service integrates with third-party platforms, including GitHub.
            Your use of these integrations is subject to the respective
            third-party terms of service. We are not responsible for any
            third-party services and make no warranties regarding their
            availability or functionality.
          </p>
        </div>

        <div>
          <h2>9. Service Availability and Modifications</h2>
          <p>
            We strive to maintain high availability of the Service but do not
            guarantee uninterrupted access. We may modify, suspend, or
            discontinue any part of the Service at any time with reasonable
            notice. We are not liable for any modification, suspension, or
            discontinuation of the Service.
          </p>
        </div>

        <div>
          <h2>10. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by applicable law, OpenDiff and its
            officers, directors, employees, and agents shall not be liable for
            any indirect, incidental, special, consequential, or punitive
            damages, including but not limited to loss of profits, data, or
            business opportunities, arising out of or related to your use of the
            Service.
          </p>
          <p>
            Our total aggregate liability for any claims arising from or related
            to the Service shall not exceed the amount you paid to us in the
            twelve (12) months preceding the event giving rise to the claim.
          </p>
        </div>

        <div>
          <h2>11. Disclaimer of Warranties</h2>
          <p>
            The Service is provided "as is" and "as available" without
            warranties of any kind, whether express or implied, including but
            not limited to implied warranties of merchantability, fitness for a
            particular purpose, and non-infringement.
          </p>
          <p>
            AI-generated code reviews and suggestions are provided for
            informational purposes only. We do not guarantee the accuracy,
            completeness, or reliability of any AI-generated output. You are
            solely responsible for reviewing and validating any suggestions
            before applying them to your codebase.
          </p>
        </div>

        <div>
          <h2>12. Indemnification</h2>
          <p>
            You agree to indemnify, defend, and hold harmless OpenDiff and its
            officers, directors, employees, and agents from and against any
            claims, liabilities, damages, losses, and expenses (including
            reasonable legal fees) arising from your use of the Service, your
            violation of these Terms, or your violation of any third-party
            rights.
          </p>
        </div>

        <div>
          <h2>13. Termination</h2>
          <p>
            We may terminate or suspend your access to the Service immediately,
            without prior notice, for any reason, including breach of these
            Terms. Upon termination, your right to use the Service ceases
            immediately.
          </p>
          <p>
            You may terminate your account at any time by contacting us at{" "}
            <a href="mailto:support@opendiff.dev">support@opendiff.dev</a>.
            Termination does not entitle you to a refund of any prepaid fees
            unless required by applicable law.
          </p>
        </div>

        <div>
          <h2>14. Changes to Terms</h2>
          <p>
            We reserve the right to update these Terms at any time. If we make
            material changes, we will notify you by posting the updated Terms on
            the Service and updating the "Last updated" date. Your continued use
            of the Service after changes are posted constitutes acceptance of
            the revised Terms.
          </p>
        </div>

        <div>
          <h2>15. Governing Law</h2>
          <p>
            These Terms are governed by and construed in accordance with the
            laws of the State of Delaware, United States, without regard to its
            conflict of law provisions. Any disputes arising from these Terms or
            the Service shall be resolved exclusively in the courts located in
            Delaware.
          </p>
        </div>

        <div>
          <h2>16. Contact</h2>
          <p>
            If you have any questions about these Terms, please contact us at{" "}
            <a href="mailto:support@opendiff.dev">support@opendiff.dev</a>.
          </p>
        </div>
      </div>
    </section>
  );
}
